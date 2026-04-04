import axios from "axios";

export const sendWhatsAppMessage = async (to, message) => {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: message }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // const waMessageId = response.data.messages?.[0]?.id;

    // await prisma.message.create({
    //   data: {
    //     conversationId: conversation_id,
    //     role: "assistant",
    //     content: message,
    //     waMessageId: waMessageId
    //   }
    // });

    // await prisma.conversation.update({
    //   where: { id: conversation_id },
    //   data: { lastMessageAt: new Date() }
    // });

    console.log(`Reply sent to ${to}`);
    return response.data;
  } catch (err) {
    console.error('Failed to send message:', err.response?.data || err.message);
    throw err;
  }
}