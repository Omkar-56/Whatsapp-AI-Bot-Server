/*
  Warnings:

  - A unique constraint covering the columns `[businessId,customerPhone,scheduledAt]` on the table `appointments` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "appointments_businessId_customerPhone_scheduledAt_key" ON "appointments"("businessId", "customerPhone", "scheduledAt");
