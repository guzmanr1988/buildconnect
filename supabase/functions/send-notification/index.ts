import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

interface NotificationRequest {
  type: 'booking_confirmed' | 'lead_received' | 'appointment_status' | 'commission_due'
  recipientEmail: string
  recipientPhone?: string
  data: Record<string, string>
}

serve(async (req) => {
  const { type, recipientEmail, recipientPhone, data }: NotificationRequest = await req.json()

  // TODO: Integrate with SendGrid for email
  // const sgMail = require('@sendgrid/mail')
  // sgMail.setApiKey(Deno.env.get('SENDGRID_API_KEY'))

  // TODO: Integrate with Twilio for SMS
  // const twilio = require('twilio')(accountSid, authToken)

  const templates: Record<string, { subject: string; body: string }> = {
    booking_confirmed: {
      subject: `Booking Confirmed — ${data.service}`,
      body: `Your site visit with ${data.vendor} is confirmed for ${data.date}. Your Project Pack has been sent.`,
    },
    lead_received: {
      subject: `New Lead — ${data.project}`,
      body: `New project from ${data.homeowner}: ${data.project} ($${data.value}). Review and respond in your dashboard.`,
    },
    appointment_status: {
      subject: `Appointment ${data.status}`,
      body: `Your appointment has been ${data.status}. ${data.details || ''}`,
    },
    commission_due: {
      subject: `Commission Due — $${data.amount}`,
      body: `Commission of $${data.amount} for ${data.project} is due within 5 days. Pay via your Banking tab.`,
    },
  }

  const template = templates[type]

  console.log(`[NOTIFICATION] ${type} to ${recipientEmail}:`, template)
  if (recipientPhone) {
    console.log(`[SMS] to ${recipientPhone}: ${template.body}`)
  }

  return new Response(JSON.stringify({ sent: true, type }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
