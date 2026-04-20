// src/services/messageHandler.js

import whatsappService from './whatsappService.js';
import axios from 'axios';
import { randomUUID } from 'crypto';
import processIntent from '../intelligence/orchestrator.js';

// ==============================
// GLOBALS
// ==============================
const processedMessages = new Set();
const START_TIME = Math.floor(Date.now() / 1000);

const userState = {};
const userSessions = {};

const MAX_ACTIVE_REQUESTS = 3;
let activeRequests = 0;

const waitingQueue = [];
const queueIntervals = {};

// ==============================
// HANDLER
// ==============================
class MessageHandler {

  async handleIncomingMessage(message, senderInfo) {

    if (!message) return;

    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);

    const messageTimestamp =
      parseInt(message.timestamp);

    if (messageTimestamp < START_TIME) {
      console.log("Mensaje viejo ignorado");
      return;
    }

    let userMessage = "";

    if (message.type === "text") {
      userMessage =
        message.text.body
          .toLowerCase()
          .trim();

    } else if (
      message.type === "interactive"
    ) {
      userMessage =
        message.interactive
          ?.button_reply
          ?.title
          ?.toLowerCase()
          ?.trim();

    } else {
      return;
    }

    const userId =
      message.from;

    if (!userSessions[userId]) {
      userSessions[userId] =
        randomUUID();

      console.log(
        "Nueva sesión creada:",
        userSessions[userId]
      );
    }

    const sessionId =
      userSessions[userId];

    if (!userState[userId]) {
      userState[userId] = {
        step: "INIT",
        feedback: {},
        last_query: null,
        last_recommendation: null,
        inQueue: false
      };
    }

    const state =
      userState[userId];

    console.log("\n==============================");
    console.log("Mensaje recibido");
    console.log("User:", userId);
    console.log("Texto:", userMessage);
    console.log("Activos:", activeRequests);
    console.log("En cola:", waitingQueue.length);
    console.log("==============================\n");

    try {

      // ==========================
      // LOCK PROCESANDO
      // ==========================
      if (
        state.step ===
        "PROCESSING"
      ) {
        await whatsappService.sendMessage(
          userId,
          "🎬 Sigo procesando tu solicitud anterior. En cuanto termine te responderé."
        );

        return;
      }

      // ==========================
      // LOCK EN COLA
      // ==========================
      if (state.inQueue) {

        const pos =
          this.getQueuePosition(
            userId
          );

        await whatsappService.sendMessage(
          userId,
          `🎬 Ya estás en la fila de espera.\nPosición actual: #${pos}`
        );

        return;
      }

      // ==========================
      // INIT
      // ==========================
      if (
        state.step === "INIT"
      ) {

        await whatsappService.sendMessage(
          userId,
          "🎬 Hola, soy CineMate AI 🍿\nEstoy aquí para recomendarte películas.\nLas respuestas pueden tardar algunos minutos.\n\n¿Qué te gustaría ver?"
        );

        state.step =
          "WAITING_QUERY";

        return;
      }

      // ==========================
      // QUERY
      // ==========================
      if (
        state.step ===
        "WAITING_QUERY"
      ) {

        const intentResult =
          await processIntent(
            userMessage
          );

        console.log(
          "Intent:",
          intentResult
        );

        // EXIT
        if (
          intentResult.intent ===
          "EXIT"
        ) {

          this.removeFromQueue(
            userId
          );

          state.step =
            "WAITING_FEEDBACK_CSAT";

          await whatsappService.sendButtons(
            userId,
            "Antes de irte, califica tu experiencia:",
            [
              "😞 Baja",
              "😐 Media",
              "😊 Alta"
            ]
          );

          return;
        }

        // BLOCK
        if (
          intentResult.intent ===
          "BLOCK"
        ) {

          await whatsappService.sendMessage(
            userId,
            "🎬 Puedo ayudarte a encontrar una buena película.\nCuéntame qué género, actor o película te gusta."
          );

          return;
        }

        // SEARCH
        const finalQuery =
          intentResult.query &&
          intentResult.query.trim()
            ? intentResult.query
            : userMessage;

        console.log(
          "FINAL QUERY:",
          finalQuery
        );

        // SIN CUPO
        if (
          activeRequests >=
          MAX_ACTIVE_REQUESTS
        ) {

          this.addToQueue(
            userId,
            sessionId,
            finalQuery
          );

          state.inQueue =
            true;

          await whatsappService.sendMessage(
            userId,
            `🎬 Alta demanda en este momento.\nTe puse en la fila de espera.\nPosición actual: #${this.getQueuePosition(userId)}`
          );

          this.startQueueUpdates(
            userId
          );

          return;
        }

        await this.processRequest(
          userId,
          sessionId,
          finalQuery
        );

        return;
      }

      // ==========================
      // CSAT
      // ==========================
      if (
        state.step ===
        "WAITING_FEEDBACK_CSAT"
      ) {

        state.feedback.csat =
          this.mapCSAT(
            userMessage
          );

        state.step =
          "WAITING_FEEDBACK_NPS";

        await whatsappService.sendButtons(
          userId,
          "¿Recomendarías CineMate AI?",
          [
            "👎 No",
            "😐 Neutral",
            "👍 Sí"
          ]
        );

        return;
      }

      // ==========================
      // NPS
      // ==========================
      if (
        state.step ===
        "WAITING_FEEDBACK_NPS"
      ) {

        const {
          score,
          category
        } =
          this.mapNPS(
            userMessage
          );

        state.feedback.nps =
          score;

        state.feedback.nps_category =
          category;

        state.step =
          "WAITING_FEEDBACK_RESOLUTION";

        await whatsappService.sendButtons(
          userId,
          "¿La recomendación se ajustó a tus gustos?",
          [
            "Sí",
            "Parcialmente",
            "No"
          ]
        );

        return;
      }

      // ==========================
      // RESOLUTION
      // ==========================
      if (
        state.step ===
        "WAITING_FEEDBACK_RESOLUTION"
      ) {

        state.feedback.resolution =
          this.mapResolution(
            userMessage
          );

        await axios.post(
          "http://127.0.0.1:8000/feedback",
          {
            session_id:
              sessionId,
            query:
              state.last_query,
            recommendation:
              state.last_recommendation,
            feedback:
              state.feedback
          }
        );

        await whatsappService.sendMessage(
          userId,
          "Gracias por tu feedback. ¡Hasta pronto!"
        );

        delete userSessions[userId];
        delete userState[userId];

        return;
      }

    } catch (error) {

      console.error(
        "Error:",
        error.response?.data ||
        error.message
      );

      state.step =
        "WAITING_QUERY";

      state.inQueue =
        false;

      await whatsappService.sendMessage(
        userId,
        "Ocurrió un error. Intenta nuevamente."
      );
    }
  }

  // ==========================
  // REQUEST
  // ==========================
  async processRequest(
    userId,
    sessionId,
    finalQuery
  ) {

    const state =
      userState[userId];

    activeRequests++;
    state.step =
      "PROCESSING";

    try {

      await whatsappService.sendMessage(
        userId,
        "🔎 Buscando una recomendación para ti..."
      );

      const response =
        await axios.post(
          "http://127.0.0.1:8000/chat",
          {
            session_id:
              sessionId,
            user_id:
              userId,
            message:
              finalQuery
          }
        );

      const aiText =
        response.data.response;

      state.last_query =
        finalQuery;

      state.last_recommendation =
        aiText;

      await whatsappService.sendMessage(
        userId,
        `🍿 ${aiText}\n\n¿Quieres otra recomendación?\nSi deseas salir escribe: salir`
      );

      state.step =
        "WAITING_QUERY";

    } catch (error) {

      console.error(
        "Error API:",
        error.response?.data ||
        error.message
      );

      state.step =
        "WAITING_QUERY";

      await whatsappService.sendMessage(
        userId,
        "Ocurrió un error procesando tu solicitud."
      );

    } finally {

      activeRequests--;

      this.processNextInQueue();
    }
  }

  // ==========================
  // COLA
  // ==========================
  addToQueue(
    userId,
    sessionId,
    message
  ) {

    const exists =
      waitingQueue.find(
        x =>
          x.userId === userId
      );

    if (exists) return;

    waitingQueue.push({
      userId,
      sessionId,
      message
    });
  }

  removeFromQueue(
    userId
  ) {

    const idx =
      waitingQueue.findIndex(
        x =>
          x.userId === userId
      );

    if (idx >= 0) {
      waitingQueue.splice(
        idx,
        1
      );
    }

    if (
      queueIntervals[userId]
    ) {
      clearInterval(
        queueIntervals[userId]
      );

      delete queueIntervals[userId];
    }

    if (
      userState[userId]
    ) {
      userState[userId].inQueue =
        false;
    }
  }

  getQueuePosition(
    userId
  ) {

    const idx =
      waitingQueue.findIndex(
        x =>
          x.userId === userId
      );

    return idx >= 0
      ? idx + 1
      : 0;
  }

  processNextInQueue() {

    if (
      activeRequests >=
      MAX_ACTIVE_REQUESTS
    ) return;

    if (
      waitingQueue.length === 0
    ) return;

    const next =
      waitingQueue.shift();

    const {
      userId,
      sessionId,
      message
    } = next;

    const state =
      userState[userId];

    if (!state) return;

    state.inQueue =
      false;

    if (
      queueIntervals[userId]
    ) {
      clearInterval(
        queueIntervals[userId]
      );

      delete queueIntervals[userId];
    }

    whatsappService.sendMessage(
      userId,
      "🎬 Ya llegó tu turno. Estoy buscando tu recomendación..."
    );

    this.processRequest(
      userId,
      sessionId,
      message
    );
  }

  startQueueUpdates(
    userId
  ) {

    if (
      queueIntervals[userId]
    ) return;

    queueIntervals[userId] =
      setInterval(
        async () => {

          const pos =
            this.getQueuePosition(
              userId
            );

          if (pos === 0) {
            clearInterval(
              queueIntervals[userId]
            );

            delete queueIntervals[userId];
            return;
          }

          await whatsappService.sendMessage(
            userId,
            `🎬 Gracias por esperar.\nTu posición actual en la fila es #${pos}`
          );

        },
        300000
      );
  }

  // ==========================
  // HELPERS
  // ==========================
  mapCSAT(msg) {

    if (
      msg.includes("baja")
    ) return 2;

    if (
      msg.includes("media")
    ) return 3;

    if (
      msg.includes("alta")
    ) return 5;

    return 3;
  }

  mapNPS(msg) {

    if (
      msg.includes("no")
    ) {
      return {
        score: 3,
        category:
          "detractor"
      };
    }

    if (
      msg.includes(
        "neutral"
      )
    ) {
      return {
        score: 7,
        category:
          "passive"
      };
    }

    return {
      score: 10,
      category:
        "promoter"
    };
  }

  mapResolution(msg) {

    if (
      msg.includes("sí")
    ) {
      return {
        label: "yes",
        numeric: 3
      };
    }

    if (
      msg.includes(
        "parcial"
      )
    ) {
      return {
        label: "partial",
        numeric: 2
      };
    }

    return {
      label: "no",
      numeric: 1
    };
  }
}

export default new MessageHandler();