import whatsappService from './whatsappService.js';
import axios from 'axios';

class MessageHandler {
  async handleIncomingMessage(message, senderInfo) {
    if (message?.type === 'text') {
      try {
        const userMessage = message.text.body;

        // -------------------------
        // LLAMAR A TU API (CineMate AI)
        // -------------------------
        const aiResponse = await axios.post("http://localhost:8000/chat", {
          user_id: message.from,
          message: userMessage
        });

        const aiText = aiResponse.data.response;

        // -------------------------
        // MENSAJE BONITO (CineMate)
        // -------------------------
        const finalResponse = `🎬✨ Hola! Soy *CineMate AI* 🍿  

Estoy aquí para recomendarte películas increíbles según lo que te guste 😎  

${aiText}

¿Quieres otra recomendación o algo diferente? 🎥🔥`;

        // -------------------------
        // ENVIAR RESPUESTA
        // -------------------------
        await whatsappService.sendMessage(
          message.from,
          finalResponse,
          message.id
        );

        await whatsappService.markAsRead(message.id);

      } catch (error) {
        console.error("Error:", error.message);

        await whatsappService.sendMessage(
          message.from,
          "😥 Ups... tuve un problema recomendando tu película. Intenta nuevamente en un momento.",
          message.id
        );
      }
    }
  }
}

export default new MessageHandler();