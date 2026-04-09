import axios from 'axios';
import config from '../config/env.js';

class WhatsAppService {
  async sendMessage(to, body) {
    try {
      await axios({
        method: 'POST',
        url: `https://graph.facebook.com/${config.API_VERSION}/${config.BUSINESS_PHONE}/messages`,
        headers: {
          Authorization: `Bearer ${config.API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        data: {
          messaging_product: 'whatsapp',
          to,
          text: { body }
        }
      });
    } catch (error) {
      console.error("Error sending message:");
      console.error(error.response?.data || error.message);
    }
  }

  async markAsRead(messageId) {
    try {
      await axios({
        method: 'POST',
        url: `https://graph.facebook.com/${config.API_VERSION}/${config.BUSINESS_PHONE}/messages`,
        headers: {
          Authorization: `Bearer ${config.API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        data: {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId
        }
      });
    } catch (error) {
      console.error("Error marking message as read:");
      console.error(error.response?.data || error.message);
    }
  }

  async sendButtons(to, body, buttons) {
    try {
      await axios({
        method: 'POST',
        url: `https://graph.facebook.com/${config.API_VERSION}/${config.BUSINESS_PHONE}/messages`,
        headers: {
          Authorization: `Bearer ${config.API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        data: {
          messaging_product: 'whatsapp',
          to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text: body
            },
            action: {
              buttons: buttons.map((btn, index) => ({
                type: 'reply',
                reply: {
                  id: `btn_${index}`,
                  title: btn
                }
              }))
            }
          }
        }
      });
    } catch (error) {
      console.error("Error sending buttons:");
      console.error(error.response?.data || error.message);
    }
  }
}

export default new WhatsAppService();