import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Phone } from 'lucide-react'
import { Logo } from '@/components/shared/logo'
import { cn } from '@/lib/utils'

interface FooterProps {
  className?: string
}

type Lang = 'en' | 'es'

function readGoogtransLang(): Lang {
  if (typeof document === 'undefined') return 'en'
  const m = document.cookie.match(/googtrans=\/(?:en|auto)\/(en|es)/)
  return m && m[1] === 'es' ? 'es' : 'en'
}

function setGoogtransCookie(target: Lang) {
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `googtrans=/en/${target}; path=/; expires=${expires}`
  const host = window.location.hostname.replace(/^www\./, '')
  if (host && !/^\d+\.\d+\.\d+\.\d+$/.test(host) && host !== 'localhost') {
    document.cookie = `googtrans=/en/${target}; path=/; domain=.${host}; expires=${expires}`
  }
}

// Inline SVG for brand marks — lucide-react deliberately excludes brand
// glyphs, and Tailwind currentColor lets us color these via text-* on the
// parent <a>. Keep paths minimal; they render at h-4 w-4.
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  )
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  )
}

export function Footer({ className }: FooterProps) {
  const [lang, setLang] = useState<Lang>(() => readGoogtransLang())

  // Inject Google Translate widget once per page-load.
  // The hidden #google_translate_element host is rendered in the footer below.
  // Language switch = set googtrans cookie + reload — most reliable cross-page
  // re-translation path. Cookie persists across navigation (path=/, +1yr).
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (document.getElementById('gtranslate-loader-script')) return
    ;(window as unknown as { googleTranslateElementInit?: () => void }).googleTranslateElementInit = () => {
      const g = (window as unknown as { google?: { translate?: { TranslateElement?: new (cfg: object, el: string) => unknown } } }).google
      if (g?.translate?.TranslateElement) {
        new g.translate.TranslateElement(
          { pageLanguage: 'en', includedLanguages: 'en,es', autoDisplay: false },
          'google_translate_element',
        )
      }
    }
    const script = document.createElement('script')
    script.id = 'gtranslate-loader-script'
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit'
    script.async = true
    document.body.appendChild(script)
  }, [])

  const switchLang = (target: Lang) => {
    if (target === lang) return
    setGoogtransCookie(target)
    setLang(target)
    window.location.reload()
  }

  return (
    <footer className={cn('mt-16 border-t bg-muted/30', className)}>
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Col 1 — Support */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-foreground">
              Support
            </h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>
                <a
                  href="tel:+13057249369"
                  className="flex items-start gap-2 hover:text-foreground"
                >
                  <Phone className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="block font-medium text-foreground">(305) 724-9369</span>
                    <span className="block text-xs">Mon-Sun 9am-8pm ET</span>
                  </span>
                </a>
              </li>
              <li>
                <a
                  href="mailto:hello@buildc.net"
                  className="flex items-center gap-2 py-2 hover:text-foreground"
                >
                  <Mail className="h-4 w-4 shrink-0" />
                  hello@buildc.net
                </a>
              </li>
              <li>
                <a
                  href="mailto:support@buildc.net"
                  className="flex items-center gap-2 py-2 hover:text-foreground"
                >
                  <Mail className="h-4 w-4 shrink-0" />
                  support@buildc.net
                </a>
              </li>
              <li>
                <Link to="/help" className="hover:text-foreground">
                  Help Center
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 2 — Trust */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-foreground">
              Trust and Coverage
            </h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li>All contractors independently licensed + insured</li>
              <li>Serving South Florida</li>
            </ul>
            <div
              data-testid="footer-trust-badges"
              aria-hidden="true"
              className="mt-6 min-h-[3rem]"
            />
          </div>

          {/* Col 3 — Quick Links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-foreground">
              Quick Links
            </h3>
            <div className="space-y-5 text-sm">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
                  For Homeowners
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li>
                    <Link to="/signup" className="hover:text-foreground">
                      Get Started
                    </Link>
                  </li>
                  <li>
                    <a href="#" className="hover:text-foreground">
                      How It Works
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-foreground">
                      FAQ
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-foreground">
                      Pricing
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
                  Company
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li>
                    <a href="#" className="hover:text-foreground">
                      About
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-foreground">
                      Blog
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-foreground">
                      Careers
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Col 4 — Company */}
          <div>
            <Logo />
            <p className="mt-3 text-sm text-muted-foreground">
              South Florida home services, simplified.
            </p>

            {/* Rod-direct task_1780802494987_731: Vendor Support relocated
                here from Quick Links col 3; Newsletter block removed. */}
            <div className="mt-6">
              <a
                href="#"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Vendor Support
              </a>
            </div>

            <div className="mt-6">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
                Language
              </p>
              <div
                role="group"
                aria-label="Language selector"
                className="inline-flex rounded-md border bg-background p-0.5"
              >
                <button
                  type="button"
                  onClick={() => switchLang('en')}
                  aria-pressed={lang === 'en'}
                  className={cn(
                    'rounded px-3 py-1 text-xs font-medium transition-colors notranslate',
                    lang === 'en'
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => switchLang('es')}
                  aria-pressed={lang === 'es'}
                  className={cn(
                    'rounded px-3 py-1 text-xs font-medium transition-colors notranslate',
                    lang === 'es'
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Spanish
                </button>
              </div>
              <div
                id="google_translate_element"
                aria-hidden="true"
                className="sr-only"
              />
            </div>
          </div>
        </div>

        {/* Bottom strip */}
        <div className="mt-12 border-t pt-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <p className="text-xs text-muted-foreground">
              © 2026 BuildConnect. All rights reserved.
            </p>
            {/* Rod-direct task_1780802494987_731: enlarged social icons.
                h-6 w-6 visible glyph + 44x44 touch target (WCAG 2.5.5 AAA).
                Default text-foreground (visible at rest, not muted); hover
                rounds + adds primary tint. */}
            <div className="flex items-center gap-2">
              <a
                href="#"
                aria-label="Instagram"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted hover:text-primary"
              >
                <InstagramIcon className="h-6 w-6" />
              </a>
              <a
                href="#"
                aria-label="Facebook"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted hover:text-primary"
              >
                <FacebookIcon className="h-6 w-6" />
              </a>
              <a
                href="#"
                aria-label="LinkedIn"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted hover:text-primary"
              >
                <LinkedinIcon className="h-6 w-6" />
              </a>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <a href="#" className="hover:text-foreground">
              Terms of Service
            </a>
            <a href="#" className="hover:text-foreground">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-foreground">
              Cookie Policy
            </a>
            <a href="#" className="hover:text-foreground">
              Accessibility
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
