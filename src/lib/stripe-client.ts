// Stripe.js loader singleton. loadStripe is idempotent + memoized
// internally — but we still cache the Promise at module-level so
// dynamic imports + HMR don't trigger duplicate `<script>` injection.
// VITE_STRIPE_PUBLIC_KEY is the publishable key (pk_test_... / pk_live_...);
// "public" + "publishable" are Stripe-interchangeable, name held over from
// the pre-existing .env.example line 6.
import { loadStripe, type Stripe } from '@stripe/stripe-js'

const PUB_KEY = import.meta.env.VITE_STRIPE_PUBLIC_KEY

if (!PUB_KEY && import.meta.env.PROD) {
  // PROD build with no key = walker would see PaymentElement crash on
  // mount with cryptic "No client_secret" before any submit. Fail
  // loud at module-init instead so the error surfaces in CI logs.
  // dev/staging without a key falls through to a null promise +
  // Elements rendering a console-warn banner (Stripe SDK default).
  throw new Error(
    '[stripe-client] VITE_STRIPE_PUBLIC_KEY missing in production build. ' +
      'Set it in Cloudflare Pages env vars before re-deploying.'
  )
}

export const stripePromise: Promise<Stripe | null> = PUB_KEY
  ? loadStripe(PUB_KEY)
  : Promise.resolve(null)
