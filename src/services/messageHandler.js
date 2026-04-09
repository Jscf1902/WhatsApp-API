import whatsappService from './whatsappService.js';
import axios from 'axios';

// ==============================
// GLOBALS
// ==============================
const processedMessages = new Set();
const START_TIME = Math.floor(Date.now() / 1000);
const userState = {};

// ==============================
// HANDLER
// ==============================
class MessageHandler {

  async handleIncomingMessage(message, senderInfo) {

    if (!message) return;

    // ------------------------------
    // FILTROS
    // ------------------------------
    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);

    const messageTimestamp = parseInt(message.timestamp);
    if (messageTimestamp < START_TIME) {
      console.log("Mensaje viejo ignorado");
      return;
    }

    // ------------------------------
    // OBTENER TEXTO (botones o texto)
    // ------------------------------
    let userMessage = "";

    if (message.type === "text") {
      userMessage = message.text.body.toLowerCase().trim();
    } else if (message.type === "interactive") {
      userMessage = message.interactive?.button_reply?.title.toLowerCase().trim();
    } else {
      return;
    }

    const userId = message.from;

    console.log("\n==============================");
    console.log("Mensaje recibido");
    console.log("User:", userId);
    console.log("Texto:", userMessage);
    console.log("==============================\n");

    // ------------------------------
    // INIT STATE
    // ------------------------------
    if (!userState[userId]) {
      userState[userId] = {
        step: "INIT",
        feedback: {},
        last_query: null,
        last_recommendation: null
      };
    }

    const state = userState[userId];

    try {

      // ============================
      // EXIT → INICIAR ENCUESTA
      // ============================
      if (this.isExit(userMessage)) {

        console.log("Iniciando encuesta");

        state.step = "WAITING_FEEDBACK_CSAT";

        await whatsappService.sendButtons(
          userId,
          "Antes de irte, califica tu experiencia:",
          ["😞 Baja", "😐 Media", "😊 Alta"]
        );

        return;
      }

      // ============================
      // BLOQUEO
      // ============================
      if (state.step === "PROCESSING") {

        await whatsappService.sendMessage(
          userId,
          "Estoy procesando tu solicitud, espera un momento..."
        );

        return;
      }

      // ============================
      // INIT → SALUDO
      // ============================
      if (state.step === "INIT") {

        console.log("Estado INIT");

        await whatsappService.sendMessage(
          userId,
          "🎬 Hola, soy CineMate AI 🍿\nEstoy aquí para recomendarte películas.\n\n¿Qué te gustaría ver?"
        );

        state.step = "WAITING_QUERY";
        return;
      }

      // ============================
      // QUERY → FASTAPI
      // ============================
      if (state.step === "WAITING_QUERY") {

        console.log("Procesando query");

        state.step = "PROCESSING";

        await whatsappService.sendMessage(
          userId,
          "🔎 Buscando una recomendación para ti..."
        );

        const response = await axios.post(
          "http://127.0.0.1:8000/chat",
          {
            user_id: userId,
            message: userMessage
          }
        );

        const aiText = response.data.response;

        state.last_query = userMessage;
        state.last_recommendation = aiText;

        await whatsappService.sendMessage(
          userId,
          `🍿 ${aiText}\n\n¿Quieres otra recomendación?\nSi deseas salir escribe: salir`
        );

        state.step = "WAITING_QUERY";
        return;
      }

      // ============================
      // CSAT
      // ============================
      if (state.step === "WAITING_FEEDBACK_CSAT") {

        state.feedback.csat = this.mapCSAT(userMessage);

        state.step = "WAITING_FEEDBACK_NPS";

        await whatsappService.sendButtons(
          userId,
          "¿Recomendarías CineMate AI?",
          ["👎 No", "😐 Neutral", "👍 Sí"]
        );

        return;
      }

      // ============================
      // NPS
      // ============================
      if (state.step === "WAITING_FEEDBACK_NPS") {

        const { score, category } = this.mapNPS(userMessage);

        state.feedback.nps = score;
        state.feedback.nps_category = category;

        state.step = "WAITING_FEEDBACK_RESOLUTION";

        await whatsappService.sendButtons(
          userId,
          "¿La recomendación se ajustó a tus gustos?",
          ["Sí", "Parcialmente", "No"]
        );

        return;
      }

      // ============================
      // RESOLUTION + SAVE
      // ============================
      if (state.step === "WAITING_FEEDBACK_RESOLUTION") {

        state.feedback.resolution = this.mapResolution(userMessage);

        console.log("Enviando feedback a FastAPI");

        await axios.post(
          "http://127.0.0.1:8000/feedback",
          {
            session_id: userId,
            query: state.last_query,
            recommendation: state.last_recommendation,
            feedback: state.feedback
          }
        );

        await whatsappService.sendMessage(
          userId,
          "Gracias por tu feedback. ¡Hasta pronto!"
        );

        delete userState[userId];
        return;
      }

    } catch (error) {

      console.error("Error:", error.response?.data || error.message);

      state.step = "WAITING_QUERY";

      await whatsappService.sendMessage(
        userId,
        "Ocurrió un error. Intenta nuevamente."
      );
    }
  }

  // ============================
  // HELPERS
  // ============================

  isExit(msg) {
    return ["salir", "exit", "quit", "adios"].some(x => msg.includes(x));
  }

  mapCSAT(msg) {
    if (msg.includes("baja")) return 2;
    if (msg.includes("media")) return 3;
    if (msg.includes("alta")) return 5;
    return 3;
  }

  mapNPS(msg) {
    if (msg.includes("no")) return { score: 3, category: "detractor" };
    if (msg.includes("neutral")) return { score: 7, category: "passive" };
    return { score: 10, category: "promoter" };
  }

  mapResolution(msg) {
    if (msg.includes("sí")) return { label: "yes", numeric: 3 };
    if (msg.includes("parcial")) return { label: "partial", numeric: 2 };
    return { label: "no", numeric: 1 };
  }
}

export default new MessageHandler();