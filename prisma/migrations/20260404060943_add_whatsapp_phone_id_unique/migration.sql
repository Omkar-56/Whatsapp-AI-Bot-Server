/*
  Warnings:

  - A unique constraint covering the columns `[whatsappPhoneId]` on the table `businesses` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "businesses_whatsappPhoneId_key" ON "businesses"("whatsappPhoneId");
