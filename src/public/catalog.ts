// Generated from design/llab/content/pub.py. Do not edit.
export const PUBLIC_SCREENS = [
  {
    "code": "PUB-01",
    "title": "Splash",
    "route": "/ouverture",
    "canonicalRoute": "/",
    "zones": [
      "canvas",
      "hero",
      "cta"
    ],
    "tokens": [
      "--surface-0",
      "--gold-500",
      "--gold-600",
      "--grad-gold",
      "--gold-aura",
      "--display-1"
    ],
    "api": [
      "GET /v1/health",
      "GET /v1/me (silencieux, si refresh token présent)"
    ]
  },
  {
    "code": "PUB-02",
    "title": "Accueil public",
    "route": "/accueil",
    "canonicalRoute": "/accueil",
    "zones": [
      "hero",
      "kpi",
      "list",
      "price",
      "cta"
    ],
    "tokens": [
      "--surface-0",
      "--surface-2",
      "--gold-500",
      "--text-hi",
      "--glass-2",
      "--grad-gold"
    ],
    "api": [
      "GET /v1/public/story?locale=fr",
      "GET /v1/public/stats (agrégats vérifiés uniquement)"
    ]
  },
  {
    "code": "PUB-03",
    "title": "Choix de profil (Client vs Prestataire)",
    "route": "/onboarding/profil",
    "canonicalRoute": "/onboarding/profil",
    "zones": [
      "hero",
      "kpi",
      "cta"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--surface-2",
      "--glass-3",
      "--squircle-28",
      "--spring-heavy"
    ],
    "api": [
      "POST /v1/onboarding/role {role}",
      "GET /v1/onboarding/role-policy"
    ]
  },
  {
    "code": "PUB-04",
    "title": "Connexion",
    "route": "/connexion",
    "canonicalRoute": "/connexion",
    "zones": [
      "hero",
      "form",
      "cta",
      "list"
    ],
    "tokens": [
      "--glass-2",
      "--stroke-mid",
      "--gold-500",
      "--clay-500",
      "--emerald-500",
      "--text-lo"
    ],
    "api": [
      "POST /v1/auth/login",
      "POST /v1/auth/magic-link",
      "GET /v1/auth/throttle-status"
    ]
  },
  {
    "code": "PUB-05",
    "title": "Inscription",
    "route": "/inscription",
    "canonicalRoute": "/inscription",
    "zones": [
      "hero",
      "form",
      "list",
      "cta"
    ],
    "tokens": [
      "--glass-2",
      "--gold-500",
      "--emerald-500",
      "--stroke-mid",
      "--caps"
    ],
    "api": [
      "POST /v1/auth/register",
      "GET /v1/geo/phone-policy",
      "POST /v1/legal/consent"
    ]
  },
  {
    "code": "PUB-06",
    "title": "Vérification OTP",
    "route": "/verifier-otp",
    "canonicalRoute": "/verifier-otp",
    "zones": [
      "hero",
      "form",
      "timeline",
      "cta"
    ],
    "tokens": [
      "--emerald-500",
      "--grad-emerald",
      "--gold-500",
      "--surface-2",
      "--squircle-14",
      "--mono"
    ],
    "api": [
      "POST /v1/auth/otp/verify",
      "POST /v1/auth/otp/resend",
      "GET /v1/auth/otp/status"
    ]
  },
  {
    "code": "PUB-07",
    "title": "Récupération de compte",
    "route": "/recuperation",
    "canonicalRoute": "/recuperation",
    "zones": [
      "hero",
      "form",
      "list",
      "cta"
    ],
    "tokens": [
      "--gold-500",
      "--emerald-500",
      "--glass-2",
      "--text-mid",
      "--mono"
    ],
    "api": [
      "POST /v1/auth/recovery/start",
      "POST /v1/auth/recovery/confirm",
      "GET /v1/auth/recovery/channels"
    ]
  },
  {
    "code": "PUB-08",
    "title": "CGU / Confidentialité",
    "route": "/legal",
    "canonicalRoute": "/legal",
    "zones": [
      "hero",
      "doc",
      "cta"
    ],
    "tokens": [
      "--surface-1",
      "--glass-1",
      "--gold-500",
      "--text-mid",
      "--callout",
      "--mono"
    ],
    "api": [
      "GET /v1/legal/documents?locale=fr",
      "GET /v1/legal/documents/:id/version",
      "POST /v1/legal/consent"
    ]
  },
  {
    "code": "PUB-09",
    "title": "Compte bloqué",
    "route": "/compte-bloque",
    "canonicalRoute": "/compte-bloque",
    "zones": [
      "hero",
      "timeline",
      "list",
      "cta"
    ],
    "tokens": [
      "--clay-500",
      "--clay-600",
      "--surface-1",
      "--text-mid",
      "--mono",
      "--squircle-28"
    ],
    "api": [
      "GET /v1/account/block-status",
      "POST /v1/account/appeal",
      "GET /v1/account/export"
    ]
  },
  {
    "code": "PUB-10",
    "title": "Maintenance",
    "route": "/maintenance",
    "canonicalRoute": "/maintenance",
    "zones": [
      "hero",
      "timeline",
      "list",
      "cta"
    ],
    "tokens": [
      "--surface-0",
      "--gold-500",
      "--emerald-500",
      "--mono",
      "--text-mid",
      "--glass-1"
    ],
    "api": [
      "GET /v1/status/window",
      "GET /v1/status/services",
      "POST /v1/notify/maintenance-resume"
    ]
  }
] as const;
