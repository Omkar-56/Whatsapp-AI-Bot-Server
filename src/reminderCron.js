// src/reminderCron.js
import cron from "node-cron"
import prisma from "./db.js"
import { sendWhatsAppMessage } from "./whatsapp.js"

const sendReminders = async () => {
  console.log("⏰ Reminder cron fired —", new Date().toISOString())

  try {
    const now = new Date()

    // Find appointments scheduled in the next 2.5 hours
    // that haven't had a reminder sent yet
    // The 2.5hr window (not exactly 2hr) accounts for cron timing drift
    const upcomingAppointments = await prisma.appointment.findMany({
      where: {
        status: "confirmed",
        reminderSent: false,
        scheduledAt: {
          gte: new Date(now.getTime() + 60 * 60 * 1000),       // at least 1 hr from now
          lte: new Date(now.getTime() + 2.5 * 60 * 60 * 1000)  // at most 2.5 hrs from now
        }
      },
      include: {
        business: true  // need business name for the message
      }
    })

    if (upcomingAppointments.length === 0) {
      console.log("📋 No reminders to send this run")
      return
    }

    console.log(`📬 Sending ${upcomingAppointments.length} reminder(s)...`)

    // Process each appointment
    for (const appointment of upcomingAppointments) {
      try {
        const timeFormatted = appointment.scheduledAt.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
          timeZone: "Asia/Kolkata"
        })

        const dateFormatted = appointment.scheduledAt.toLocaleDateString("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "Asia/Kolkata"
        })

        const reminderMessage =
          `🔔 *Appointment Reminder*\n\n` +
          `Hi ${appointment.customerName}! Your appointment is coming up soon.\n\n` +
          `🏥 *${appointment.business.name}*\n` +
          `🦷 *Service:* ${appointment.service}\n` +
          `📅 *${dateFormatted}*\n` +
          `⏰ *${timeFormatted}*\n\n` +
          `Please arrive 5 minutes early. See you soon! 😊\n\n` +
          `_To cancel or reschedule, reply to this message._`

        await sendWhatsAppMessage(appointment.customerPhone, reminderMessage)

        // Mark as sent IMMEDIATELY after sending
        // Do this one by one inside the loop — if one fails,
        // others still get processed
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { reminderSent: true }
        })

        console.log(`✅ Reminder sent to ${appointment.customerName} (${appointment.customerPhone})`)

        // Small delay between messages to avoid WhatsApp rate limits
        await new Promise(resolve => setTimeout(resolve, 500))

      } catch (err) {
        // Log individual failure but continue processing others
        console.error(`❌ Failed reminder for ${appointment.customerPhone}:`, err.message)
      }
    }

  } catch (err) {
    console.error("❌ Reminder cron error:", err.message)
  }
}

export const startReminderCron = () => {
  // Run every 30 minutes
  // Cron syntax: "*/30 * * * *" = at minute 0 and 30 of every hour
  cron.schedule("0 * * * *", sendReminders, {
    timezone: "Asia/Kolkata"  // IST — important for date calculations
  })

  console.log("Reminder cron started — fires every 30 minutes (IST)")

  // Also run once immediately on server start
  // so you don't wait 30 minutes for the first check
  sendReminders()
}