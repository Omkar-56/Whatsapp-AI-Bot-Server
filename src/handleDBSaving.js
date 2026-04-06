// import prisma from "prisma.js";

// export const createOrUpdateCov = async (businessId, customerPhone) => {
//   const conversation = await prisma.conversation.upsert({
//       where: {
//         businessId_customerPhone: {
//           businessId: businessId,
//           customerPhone: customerPhone
//         }
//       },
//       update: {
//         lastMessageAt: new Date(),
//         status: 'active'
//       },
//       create: {
//         businessId: businessId,
//         customerPhone: customerPhone,
//         status: 'active',
//         lastMessageAt: new Date()
//       }
//     });

//     return conversation;
// }

// export const saveMessageAndUpdateConv = async (data) => {
//   await prisma.$transaction([
//     prisma.message.create({
//       data: {
//         conversationId,
//         ...messageData
//       }
//     }),
//     prisma.conversation.update({
//       where: { id: conversationId },
//       data: { lastMessageAt: new Date() }
//     })
//   ]);
// }