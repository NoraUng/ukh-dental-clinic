/* ============================================================================
  UKH DENTAL CLINIC — SITE SCRIPT
  ----------------------------------------------------------------------------
  Appointment requests are sent to the submit-appointment Supabase Edge
  Function (see supabase/functions/submit-appointment/index.js) — nothing
  is stored in the browser anymore, and there is no client-side admin/CSV
  panel. The staff dashboard lives at staff/dashboard.html and talks to
  Supabase directly using an authenticated session, gated by Row Level
  Security.

  window.APP_CONFIG (from config.js, generated per environment — see
  scripts/generate-config.js) supplies the Supabase URL/anon key, the
  submit-appointment function URL, and the Turnstile site key. All of
  those values are meant to be public; nothing secret is ever read here.
  ============================================================================ */

const APP_CONFIG = window.APP_CONFIG || {};

if (!APP_CONFIG.SUBMIT_APPOINTMENT_URL || !APP_CONFIG.TURNSTILE_SITE_KEY) {
  // Fails loudly in the console (not to the visitor) so a missing
  // config.js during local development or a bad Cloudflare Pages build is
  // obvious immediately instead of surfacing as a confusing form error.
  console.error(
    "APP_CONFIG is missing required values. Did you create config.js from config.example.js " +
      "(local dev) or set the Cloudflare Pages environment variables (deployed)?",
  );
}

const menuButton = document.getElementById("menuButton");
const navMenu = document.getElementById("navMenu");
const languageButton = document.getElementById("languageButton");
const yearElement = document.getElementById("year");
const dateInput = document.getElementById("date");
const timeSelect = document.getElementById("time");
const serviceSelect = document.getElementById("service");
const doctorSelect = document.getElementById("doctor");
const medicalConditionSelect = document.getElementById("medicalCondition");
const medicalConditionDetailsGroup = document.getElementById(
  "medicalConditionDetailsGroup",
);
const medicalConditionDetailsInput = document.getElementById(
  "medicalConditionDetails",
);
const otherServiceDetailsGroup = document.getElementById(
  "otherServiceDetailsGroup",
);
const otherServiceDetailsInput = document.getElementById(
  "otherServiceDetails",
);
const appointmentForm = document.getElementById("appointmentForm");
const appointmentAlert = document.getElementById("appointmentAlert");
const appointmentSubmitButton = document.getElementById(
  "appointmentSubmitButton",
);
const turnstileError = document.getElementById("turnstileError");
const contactForm = document.getElementById("contactForm");
const contactAlert = document.getElementById("contactAlert");
const contactTurnstileError = document.getElementById("contactTurnstileError");
const contactSubmitButton = document.getElementById("contactSubmitButton");
const backToTopButton = document.getElementById("backToTop");
const testimonialText = document.getElementById("testimonialText");
const testimonialService = document.getElementById("testimonialService");
const prevTestimonial = document.getElementById("prevTestimonial");
const nextTestimonial = document.getElementById("nextTestimonial");

/* ============================================================================
  LANGUAGE / i18n
  ----------------------------------------------------------------------------
  1. Every translatable element in index.html has a data-i18n="keyName"
      attribute (or data-i18n-placeholder="keyName" for input placeholders).
  2. applyLanguage(language) looks up each keyName in translations[language]
      and writes it into that element's textContent (or placeholder).
  3. The chosen language is remembered in localStorage — this is a display
      preference only, not appointment data, so it's fine to keep here.

  HOW TO ADD A NEW TRANSLATABLE STRING
  1. Add data-i18n="yourKeyName" (or data-i18n-placeholder="...") to the
      element in index.html.
  2. Add yourKeyName to BOTH the en and km objects below.
  ============================================================================ */

let currentLanguage = localStorage.getItem("ukhLanguage") || "en";

const translations = {
  en: {
    // --- Navigation ---
    navHome: "Home",
    navServices: "Services",
    navDoctors: "Doctors",
    navBooking: "Book",
    navContact: "Contact",
    navCTA: "Book Appointment",

    // --- Hero ---
    heroEyebrow: "Trusted dental care in Phnom Penh, Cambodia",
    heroTitle: "Gentle dental care for confident smiles.",
    heroDescription:
      "Welcome to Ung Kheang Heang Dental Clinic. We provide dental cleaning, tooth filling, teeth whitening, braces consultation, root canal care, and emergency dental visits.",
    heroPrimary: "Book an Appointment",
    heroSecondary: "Explore Services",
    statDoctors: "Doctors",
    statServices: "Services",
    statLocation: "Phnom Penh",
    heroCardTitle: "Smile Care",
    heroCardText: "Modern, friendly, and family-focused dental treatment.",
    openHours: "Open Hours",
    openHoursTime: "Mon–Sat: 8:00 AM – 6:00 PM",

    // --- Services ---
    servicesEyebrow: "Our Services",
    servicesTitle: "Dental care for every smile.",
    servicesDescription:
      "Filter by category or click “Book this service” to automatically select it in the appointment form.",
    filterAll: "All",
    filterPreventive: "Preventive",
    filterRestorative: "Restorative",
    filterCosmetic: "Cosmetic",
    filterEmergency: "Emergency",
    serviceCleaningTitle: "Dental Cleaning & Checkup",
    serviceCleaningText:
      "Routine exam, tartar removal, polishing, and dental advice.",
    serviceFillingTitle: "Tooth Filling",
    serviceFillingText:
      "Treatment for cavities using tooth-colored filling material.",
    serviceWhiteningTitle: "Teeth Whitening",
    serviceWhiteningText:
      "Whitening options to help improve the brightness of your smile.",
    serviceRootTitle: "Root Canal Care",
    serviceRootText: "Treatment for infected, painful, or damaged teeth.",
    serviceBracesTitle: "Braces & Aligners",
    serviceBracesText:
      "Consultation for straighter teeth and better bite alignment.",
    serviceEmergencyTitle: "Emergency Visit",
    serviceEmergencyText:
      "Help for toothaches, broken teeth, swelling, or urgent pain.",
    serviceImplantsTitle: "Dental Implants",
    serviceImplantsText:
      "Permanent replacement for missing teeth, anchored in the jaw.",
    serviceExtractionTitle: "Teeth Extraction",
    serviceExtractionText:
      "Removal of a damaged, decayed, or problematic tooth.",
    serviceOtherTitle: "Other",
    serviceOtherText:
      "Not sure which service you need? Book a visit and describe it to us.",
    bookThisService: "Book this service",

    // --- Doctors ---
    doctorsEyebrow: "Meet Our Doctors",
    doctorsTitle: "Experienced care from a small, friendly team.",
    generalDentist: "General Dentist",
    doctorNoryName: "Dr. Nory Ung",
    doctorNoryText:
      "Focused on preventive care, restorative treatment, and comfortable patient visits.",
    doctorMuyText:
      "Provides family dentistry, cosmetic consultation, and personalized treatment planning.",
    bookWithNory: "Book with Dr. Nory",
    bookWithMuy: "Book with Dr. Muy",

    // --- Booking / Appointment Form
    // (labelName, labelEmail, labelMessage below are reused by the contact form too) ---
    bookingEyebrow: "Online Booking",
    bookingTitle: "Request an appointment.",
    bookingDescription:
      "Send us your appointment details below. This is a request, not a confirmed booking — our team reviews every request and will contact you to confirm the date and time.",
    featureValidation: "Form validation",
    featureDoctor: "Doctor selection",
    featureReviewed: "Reviewed by our clinic team",
    featureSecure: "Spam-protected, secure submission",
    appointmentFormTitle: "Appointment Request",
    labelName: "Full Name",
    labelPhone: "Phone Number",
    labelEmail: "Email Address",
    labelPatientType: "Patient Type",
    selectOne: "Select one",
    newPatient: "New patient",
    returningPatient: "Returning patient",
    labelService: "Service",
    selectService: "Select service",
    labelOtherServiceDetails: "Please describe the service you need",
    otherServiceDetailsPlaceholder: "e.g. denture repair",
    labelDoctor: "Preferred Doctor",
    selectDoctor: "Select doctor",
    noPreference: "No preference",
    labelDate: "Preferred Date",
    labelTime: "Preferred Time",
    selectTime: "Select time",
    timeMorning: "Morning",
    timeAfternoon: "Afternoon",
    labelMedicalCondition: "Any medical conditions we should know about?",
    selectMedicalCondition: "Select one",
    medicalConditionNone: "None",
    medicalConditionBloodPressure: "High blood pressure",
    medicalConditionDiabetes: "Diabetes",
    medicalConditionAllergies: "Allergies",
    medicalConditionOther: "Other",
    labelMedicalConditionDetails: "Please describe",
    medicalConditionDetailsPlaceholder: "e.g. penicillin allergy",
    labelMessage: "Message",
    messagePlaceholder: "Briefly tell us the reason for your visit.",
    messageHint:
      "A short note is fine — for medical conditions, please use the dropdown above instead of writing them here.",
    labelConsent: "I agree to be contacted about this appointment request.",
    submitAppointment: "Submit Appointment",
    submittingAppointment: "Submitting…",

    // --- Appointment submission outcomes (server-driven, mapped from the
    // Edge Function's response `code`) ---
    msgSuccessPrefix:
      "Appointment request submitted successfully! Reference number:",
    msgValidationError: "Please fix the highlighted fields and try again.",
    msgSpamDetected:
      "We couldn't verify the security check. Please complete it again and resubmit.",
    msgRateLimited:
      "Too many requests from this device. Please wait a while and try again.",
    msgDuplicatePrefix: "You already sent this request. Reference number:",
    msgServerError:
      "Something went wrong on our side. Please try again in a moment.",
    msgNetworkError:
      "We couldn't reach the server. Please check your connection and try again.",
    msgTurnstileRequired:
      "Please complete the verification below before submitting.",
    fieldErrorInvalidName: "Please enter your full name.",
    fieldErrorInvalidPhone: "Please enter a valid phone number.",
    fieldErrorInvalidEmail: "Please enter a valid email address.",
    fieldErrorInvalidPatientType: "Please select patient type.",
    fieldErrorInvalidService: "Please select a service.",
    fieldErrorOtherServiceRequired: "Please describe the service you need.",
    fieldErrorInvalidDoctor: "Please select a doctor.",
    fieldErrorInvalidMedicalCondition:
      "Please select an option, or \"None\" if not applicable.",
    fieldErrorInvalidDate: "Please select a valid date.",
    fieldErrorDateInPast: "Please choose a date that is today or later.",
    fieldErrorDateTooFar: "Please choose a date within the next few months.",
    fieldErrorInvalidTime: "Please select a time.",
    fieldErrorConsentRequired:
      "You must agree to be contacted about this appointment.",

    // --- Testimonials ---
    testimonialsEyebrow: "Testimonials",
    testimonialsTitle: "What patients may say.",

    // --- FAQ ---
    faqTitle: "Common questions",
    faqDescription: "Edit these later based on the real clinic policy.",
    faqOneQ: "Do I need an appointment?",
    faqOneA:
      "Appointments are recommended so the clinic can prepare and reduce waiting time.",
    faqTwoQ: "Can I book for a child?",
    faqTwoA:
      "Yes. Use the appointment form and write the child’s age in the message box.",
    faqThreeQ: "What should I bring?",
    faqThreeA:
      "Bring your ID, previous dental records if available, and a list of current medications.",
    faqFourQ: "Is this booking form connected to the clinic?",
    faqFourA:
      "Yes. Your request is sent securely to our clinic team for review. It is not an automatic confirmation — we will contact you to confirm your appointment.",

    // --- Contact ---
    contactEyebrow: "Visit Us",
    contactLocationLabel: "Location:",
    contactLocation: "121E0, 182St, Orussey 2, 7 Makara, Phnom Penh",
    contactPhoneLabel: "Phone:",
    contactPhone: "011-711-123",
    contactEmailLabel: "Email:",
    contactEmail: "unora2002@gmail.com",
    contactHoursLabel: "Hours:",
    contactHours: "Monday–Saturday, 8:00 AM – 6:00 PM",
    directionsButton: "Get Directions",
    contactFormTitle: "Send a Message",
    sendMessageButton: "Send Message",
    fieldErrorContactMessage: "Please enter your message.",
    msgContactSuccess: "Your message has been sent. We'll get back to you soon.",

    // --- Footer ---
    footerText: "Gentle, professional dental care in Phnom Penh, Cambodia.",
    footerLinks: "Quick Links",
    staffLogin: "Staff Login",
    rights: "All rights reserved.",
  },
  km: {
    // --- Navigation ---
    navHome: "ទំព័រដើម",
    navServices: "សេវាកម្ម",
    navDoctors: "វេជ្ជបណ្ឌិត",
    navBooking: "កក់ជួប",
    navContact: "ទំនាក់ទំនង",
    navCTA: "កក់ការណាត់ជួប",

    // --- Hero ---
    heroEyebrow: "សេវាថែទាំធ្មេញនៅរាជធានីភ្នំពេញ",
    heroTitle: "ថែទាំធ្មេញដោយទន់ភ្លន់ សម្រាប់ស្នាមញញឹមប្រកបដោយទំនុកចិត្ត។",
    heroDescription:
      "សូមស្វាគមន៍មកកាន់ Ung Kheang Heang Dental Clinic។ យើងផ្តល់សេវាសម្អាតធ្មេញ ប៉ះធ្មេញ ធ្វើឱ្យធ្មេញស សេវាពិគ្រោះអំពីដែកធ្មេញ ព្យាបាលឫសធ្មេញ និងការពិនិត្យបន្ទាន់។",
    heroPrimary: "កក់ការណាត់ជួប",
    heroSecondary: "មើលសេវាកម្ម",
    statDoctors: "វេជ្ជបណ្ឌិត",
    statServices: "សេវាកម្ម",
    statLocation: "ភ្នំពេញ",
    heroCardTitle: "ថែទាំស្នាមញញឹម",
    heroCardText:
      "ការព្យាបាលធ្មេញទំនើប រួសរាយរាក់ទាក់ និងសមស្របសម្រាប់គ្រួសារ។",
    openHours: "ម៉ោងបើក",
    openHoursTime: "ច័ន្ទ–សៅរ៍: 8:00 ព្រឹក – 6:00 ល្ងាច",

    // --- Services ---
    servicesEyebrow: "សេវាកម្មរបស់យើង",
    servicesTitle: "សេវាថែទាំធ្មេញសម្រាប់គ្រប់ស្នាមញញឹម។",
    servicesDescription:
      "ជ្រើសតាមប្រភេទ ឬចុច “កក់សេវានេះ” ដើម្បីបញ្ចូលសេវាទៅក្នុងទម្រង់កក់ដោយស្វ័យប្រវត្តិ។",
    filterAll: "ទាំងអស់",
    filterPreventive: "ការពារ",
    filterRestorative: "ជួសជុល",
    filterCosmetic: "សម្ផស្ស",
    filterEmergency: "បន្ទាន់",
    serviceCleaningTitle: "សម្អាតធ្មេញ និងពិនិត្យធ្មេញ",
    serviceCleaningText: "ពិនិត្យទូទៅ ដកកំណកធ្មេញ ខាត់ធ្មេញ និងផ្តល់ដំបូន្មាន។",
    serviceFillingTitle: "ប៉ះធ្មេញ",
    serviceFillingText: "ព្យាបាលធ្មេញពុកដោយប្រើសម្ភារៈពណ៌ស្រដៀងធ្មេញ។",
    serviceWhiteningTitle: "ធ្វើឱ្យធ្មេញស",
    serviceWhiteningText: "ជម្រើសធ្វើឱ្យធ្មេញភ្លឺ និងស្រស់ស្អាតជាងមុន។",
    serviceRootTitle: "ព្យាបាលឫសធ្មេញ",
    serviceRootText: "ព្យាបាលធ្មេញឆ្លងមេរោគ ឈឺ ឬខូចខាត។",
    serviceBracesTitle: "ដែកធ្មេញ និង Aligners",
    serviceBracesText: "ពិគ្រោះអំពីការតម្រង់ធ្មេញ និងកែលម្អការខាំ។",
    serviceEmergencyTitle: "ការពិនិត្យបន្ទាន់",
    serviceEmergencyText: "ជួយពេលឈឺធ្មេញ ធ្មេញបាក់ ហើម ឬមានការឈឺចាប់បន្ទាន់។",
    serviceImplantsTitle: "ការដាក់ធ្មេញសិប្បនិម្មិត",
    serviceImplantsText: "ការជំនួសធ្មេញដែលបាត់អចិន្ត្រៃយ៍ ដោយបញ្ចូលក្នុងឆ្អឹងថ្គាម។",
    serviceExtractionTitle: "ការដកធ្មេញ",
    serviceExtractionText: "ការដកចេញនូវធ្មេញដែលខូច ពុក ឬមានបញ្ហា។",
    serviceOtherTitle: "ផ្សេងទៀត",
    serviceOtherText: "មិនប្រាកដថាត្រូវការសេវាមួយណា? សូមកក់ និងពិពណ៌នាមកយើង។",
    bookThisService: "កក់សេវានេះ",

    // --- Doctors ---
    doctorsEyebrow: "ជួបវេជ្ជបណ្ឌិតរបស់យើង",
    doctorsTitle: "ការថែទាំប្រកបដោយបទពិសោធន៍ពីក្រុមតូច និងរួសរាយ។",
    generalDentist: "វេជ្ជបណ្ឌិតធ្មេញទូទៅ",
    doctorNoryName: "Dr. Nory Ung",
    doctorNoryText:
      "ផ្តោតលើការថែទាំការពារ ការព្យាបាលជួសជុល និងការពិនិត្យប្រកបដោយផាសុកភាព។",
    doctorMuyText:
      "ផ្តល់សេវាធ្មេញសម្រាប់គ្រួសារ ពិគ្រោះសម្ផស្ស និងផែនការព្យាបាលផ្ទាល់ខ្លួន។",
    bookWithNory: "កក់ជាមួយ Dr. Nory",
    bookWithMuy: "កក់ជាមួយ Dr. Muy",

    // --- Booking / Appointment Form ---
    bookingEyebrow: "កក់តាមអ៊ីនធឺណិត",
    bookingTitle: "ស្នើសុំការណាត់ជួប។",
    bookingDescription:
      "សូមផ្ញើព័ត៌មានការណាត់ជួបរបស់អ្នកខាងក្រោម។ នេះជាសំណើ មិនមែនជាការកក់ដែលបានបញ្ជាក់ទេ — ក្រុមការងាររបស់យើងនឹងពិនិត្យសំណើនីមួយៗ ហើយនឹងទាក់ទងអ្នកដើម្បីបញ្ជាក់ថ្ងៃ និងម៉ោង។",
    featureValidation: "ពិនិត្យទម្រង់",
    featureDoctor: "ជ្រើសវេជ្ជបណ្ឌិត",
    featureReviewed: "ត្រួតពិនិត្យដោយក្រុមការងារគ្លីនិក",
    featureSecure: "ការផ្ញើសុវត្ថិភាព និងការពារសារឥតបានការ",
    appointmentFormTitle: "ទម្រង់ស្នើសុំការណាត់ជួប",
    labelName: "ឈ្មោះពេញ",
    labelPhone: "លេខទូរស័ព្ទ",
    labelEmail: "អ៊ីមែល",
    labelPatientType: "ប្រភេទអ្នកជំងឺ",
    selectOne: "ជ្រើសរើសមួយ",
    newPatient: "អ្នកជំងឺថ្មី",
    returningPatient: "អ្នកជំងឺចាស់",
    labelService: "សេវាកម្ម",
    selectService: "ជ្រើសសេវាកម្ម",
    labelOtherServiceDetails: "សូមពិពណ៌នាសេវាដែលអ្នកត្រូវការ",
    otherServiceDetailsPlaceholder: "ឧទាហរណ៍ ជួសជុលធ្មេញសិប្បនិម្មិត",
    labelDoctor: "វេជ្ជបណ្ឌិតដែលចង់ជួប",
    selectDoctor: "ជ្រើសវេជ្ជបណ្ឌិត",
    noPreference: "មិនកំណត់",
    labelDate: "កាលបរិច្ឆេទដែលចង់បាន",
    labelTime: "ម៉ោងដែលចង់បាន",
    selectTime: "ជ្រើសម៉ោង",
    timeMorning: "ព្រឹក",
    timeAfternoon: "រសៀល",
    labelMedicalCondition: "តើអ្នកមានជំងឺអ្វីដែលយើងគួរដឹងទេ?",
    selectMedicalCondition: "ជ្រើសរើសមួយ",
    medicalConditionNone: "គ្មាន",
    medicalConditionBloodPressure: "សម្ពាធឈាមខ្ពស់",
    medicalConditionDiabetes: "ជំងឺទឹកនោមផ្អែម",
    medicalConditionAllergies: "អាឡែហ្ស៊ី",
    medicalConditionOther: "ផ្សេងទៀត",
    labelMedicalConditionDetails: "សូមពិពណ៌នា",
    medicalConditionDetailsPlaceholder: "ឧទាហរណ៍ អាឡែហ្ស៊ីនឹងថ្នាំប៉េនីស៊ីលីន",
    labelMessage: "សារ",
    messagePlaceholder: "សូមរៀបរាប់ខ្លីៗអំពីមូលហេតុនៃការមកជួប។",
    messageHint:
      "សេចក្តីខ្លីៗគឺគ្រប់គ្រាន់ហើយ — សម្រាប់ជំងឺផ្សេងៗ សូមប្រើម៉ឺនុយខាងលើជំនួសឱ្យការសរសេរនៅទីនេះ។",
    labelConsent: "ខ្ញុំយល់ព្រមឱ្យទាក់ទងមកខ្ញុំពីការស្នើសុំណាត់ជួបនេះ។",
    submitAppointment: "ផ្ញើការណាត់ជួប",
    submittingAppointment: "កំពុងផ្ញើ…",

    msgSuccessPrefix: "បានផ្ញើសំណើណាត់ជួបដោយជោគជ័យ! លេខយោង:",
    msgValidationError: "សូមកែប្រែប្រអប់ដែលបានបន្លិច ហើយសាកល្បងម្តងទៀត។",
    msgSpamDetected:
      "យើងមិនអាចផ្ទៀងផ្ទាត់ការត្រួតពិនិត្យសុវត្ថិភាពបានទេ។ សូមបំពេញវាម្តងទៀត ហើយផ្ញើសារជាថ្មី។",
    msgRateLimited:
      "មានការស្នើសុំច្រើនពេកពីឧបករណ៍នេះ។ សូមរង់ចាំបន្តិច ហើយសាកល្បងម្តងទៀត។",
    msgDuplicatePrefix: "អ្នកបានផ្ញើសំណើនេះរួចហើយ។ លេខយោង:",
    msgServerError:
      "មានបញ្ហាបច្ចេកទេសកើតឡើង។ សូមសាកល្បងម្តងទៀតក្នុងពេលបន្តិចទៀត។",
    msgNetworkError:
      "យើងមិនអាចភ្ជាប់ទៅម៉ាស៊ីនមេបានទេ។ សូមពិនិត្យការតភ្ជាប់អ៊ីនធឺណិត ហើយសាកល្បងម្តងទៀត។",
    msgTurnstileRequired: "សូមបំពេញការផ្ទៀងផ្ទាត់ខាងក្រោមមុនពេលផ្ញើ។",
    fieldErrorInvalidName: "សូមបញ្ចូលឈ្មោះពេញរបស់អ្នក។",
    fieldErrorInvalidPhone: "សូមបញ្ចូលលេខទូរស័ព្ទដែលត្រឹមត្រូវ។",
    fieldErrorInvalidEmail: "សូមបញ្ចូលអាសយដ្ឋានអ៊ីមែលដែលត្រឹមត្រូវ។",
    fieldErrorInvalidPatientType: "សូមជ្រើសរើសប្រភេទអ្នកជំងឺ។",
    fieldErrorInvalidService: "សូមជ្រើសរើសសេវាកម្ម។",
    fieldErrorOtherServiceRequired: "សូមពិពណ៌នាសេវាដែលអ្នកត្រូវការ។",
    fieldErrorInvalidDoctor: "សូមជ្រើសរើសវេជ្ជបណ្ឌិត។",
    fieldErrorInvalidMedicalCondition: "សូមជ្រើសរើសមួយ ឬ \"គ្មាន\" បើមិនពាក់ព័ន្ធ។",
    fieldErrorInvalidDate: "សូមជ្រើសរើសកាលបរិច្ឆេទត្រឹមត្រូវ។",
    fieldErrorDateInPast: "សូមជ្រើសរើសកាលបរិច្ឆេទថ្ងៃនេះ ឬថ្ងៃក្រោយ។",
    fieldErrorDateTooFar: "សូមជ្រើសរើសកាលបរិច្ឆេទក្នុងរយៈពេលពីរបីខែខាងមុខ។",
    fieldErrorInvalidTime: "សូមជ្រើសរើសម៉ោង។",
    fieldErrorConsentRequired: "អ្នកត្រូវយល់ព្រមឱ្យទាក់ទងអំពីការណាត់ជួបនេះ។",

    // --- Testimonials ---
    testimonialsEyebrow: "មតិអ្នកជំងឺ",
    testimonialsTitle: "អ្វីដែលអ្នកជំងឺអាចនិយាយ។",

    // --- FAQ ---
    faqTitle: "សំណួរដែលគេសួរញឹកញាប់",
    faqDescription: "កែប្រែតាមគោលការណ៍ពិតរបស់គ្លីនិក។",
    faqOneQ: "តើខ្ញុំត្រូវការណាត់ជួបមុនទេ?",
    faqOneA:
      "គួរណាត់ជួបជាមុន ដើម្បីឱ្យគ្លីនិករៀបចំបានល្អ និងកាត់បន្ថយពេលរង់ចាំ។",
    faqTwoQ: "តើអាចកក់សម្រាប់កុមារបានទេ?",
    faqTwoA: "បាន។ សូមប្រើទម្រង់កក់ ហើយសរសេរអាយុកុមារក្នុងប្រអប់សារ។",
    faqThreeQ: "តើខ្ញុំគួរយកអ្វីទៅជាមួយ?",
    faqThreeA:
      "សូមយកអត្តសញ្ញាណប័ណ្ណ ប្រវត្តិព្យាបាលធ្មេញបើមាន និងបញ្ជីថ្នាំដែលកំពុងប្រើ។",
    faqFourQ: "តើទម្រង់កក់នេះភ្ជាប់ទៅគ្លីនិកពិតហើយឬនៅ?",
    faqFourA:
      "បាទ/ចាស។ សំណើរបស់អ្នកត្រូវបានផ្ញើដោយសុវត្ថិភាពទៅក្រុមការងារគ្លីនិកយើងដើម្បីត្រួតពិនិត្យ។ វាមិនមែនជាការបញ្ជាក់ដោយស្វ័យប្រវត្តិទេ — យើងនឹងទាក់ទងអ្នកដើម្បីបញ្ជាក់ការណាត់ជួប។",

    // --- Contact ---
    contactEyebrow: "មកជួបយើង",
    contactLocationLabel: "ទីតាំង:",
    contactLocation: "១២១ E0, ផ្លូវ ១៨២, ក្រុងភ្នំពេញ, សង្កាត់អូឬស្សី២, ខណ្ឌ៧មករា",
    contactPhoneLabel: "ទូរស័ព្ទ:",
    contactPhone: "011-711-123",
    contactEmailLabel: "អ៊ីមែល:",
    contactEmail: "unora2002@gmail.com",
    contactHoursLabel: "ម៉ោង:",
    contactHours: "ច័ន្ទ–សៅរ៍, 8:00 ព្រឹក – 6:00 ល្ងាច",
    directionsButton: "បើកផែនទី",
    contactFormTitle: "ផ្ញើសារ",
    sendMessageButton: "ផ្ញើសារ",
    fieldErrorContactMessage: "សូមបញ្ចូលសាររបស់អ្នក។",
    msgContactSuccess: "សាររបស់អ្នកត្រូវបានផ្ញើហើយ។ យើងនឹងឆ្លើយតបទៅអ្នកឆាប់ៗនេះ។",

    // --- Footer ---
    footerText: "សេវាថែទាំធ្មេញដ៏ទន់ភ្លន់ និងវិជ្ជាជីវៈនៅភ្នំពេញ កម្ពុជា។",
    footerLinks: "តំណរហ័ស",
    staffLogin: "ចូលគណនីបុគ្គលិក",
    rights: "រក្សាសិទ្ធិគ្រប់យ៉ាង។",
  },
};

// Applies the current language's group labels to the "Preferred Time"
// dropdown's <optgroup> elements. Called from applyLanguage() (on every
// language switch) and from createTimeOptions() (on first page load).
function updateTimeGroupLabels() {
  const morningGroup = document.getElementById("timeGroupMorning");
  const afternoonGroup = document.getElementById("timeGroupAfternoon");

  if (morningGroup) {
    morningGroup.label = translations[currentLanguage].timeMorning;
  }
  if (afternoonGroup) {
    afternoonGroup.label = translations[currentLanguage].timeAfternoon;
  }
}

function applyLanguage(language) {
  const previousLanguage = currentLanguage;
  currentLanguage = language;
  localStorage.setItem("ukhLanguage", language);
  document.documentElement.lang = language === "km" ? "km" : "en";
  document.body.classList.toggle("khmer-mode", language === "km");
  languageButton.textContent = language === "en" ? "ភាសាខ្មែរ" : "English";

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (translations[language][key]) {
      element.textContent = translations[language][key];
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const key = element.dataset.i18nPlaceholder;
    if (translations[language][key]) {
      element.placeholder = translations[language][key];
    }
  });

  updateTimeGroupLabels();
  renderTurnstileWidget("appointment", previousLanguage !== language);
  renderTurnstileWidget("contact", previousLanguage !== language);
}

languageButton.addEventListener("click", () => {
  applyLanguage(currentLanguage === "en" ? "km" : "en");
});

let currentTestimonialIndex = 0;

const testimonials = [
  {
    text: "“The clinic was gentle, clean, and very friendly.”",
    service: "Dental Cleaning",
  },
  {
    text: "“The doctor explained everything clearly before treatment.”",
    service: "Tooth Filling",
  },
  {
    text: "“Booking was easy and the visit felt comfortable.”",
    service: "Dental Checkup",
  },
];

function init() {
  yearElement.textContent = new Date().getFullYear();
  setMinimumDate();
  createTimeOptions();
  applyLanguage(currentLanguage);
  renderTestimonial();
  observeRevealElements();
}

function setMinimumDate() {
  const today = new Date().toISOString().split("T")[0];
  dateInput.min = today;
}

function createTimeOptions() {
  // Grouped into Morning/Afternoon (rather than one flat 17-item list) so the
  // native time picker is easier to scan, especially on mobile. Group labels
  // are language-aware — see updateTimeGroupLabels() above. This list must
  // stay in sync with ALLOWED_TIMES in
  // supabase/functions/_shared/validation.js.
  const morningTimes = [
    "8:00 AM",
    "8:30 AM",
    "9:00 AM",
    "9:30 AM",
    "10:00 AM",
    "10:30 AM",
    "11:00 AM",
    "11:30 AM",
  ];

  const afternoonTimes = [
    "1:00 PM",
    "1:30 PM",
    "2:00 PM",
    "2:30 PM",
    "3:00 PM",
    "3:30 PM",
    "4:00 PM",
    "4:30 PM",
    "5:00 PM",
  ];

  const morningGroup = document.createElement("optgroup");
  morningGroup.id = "timeGroupMorning";
  morningTimes.forEach((time) => {
    const option = document.createElement("option");
    option.value = time;
    option.textContent = time;
    morningGroup.appendChild(option);
  });

  const afternoonGroup = document.createElement("optgroup");
  afternoonGroup.id = "timeGroupAfternoon";
  afternoonTimes.forEach((time) => {
    const option = document.createElement("option");
    option.value = time;
    option.textContent = time;
    afternoonGroup.appendChild(option);
  });

  timeSelect.appendChild(morningGroup);
  timeSelect.appendChild(afternoonGroup);

  updateTimeGroupLabels();
}

function toggleMenu() {
  const isOpen = navMenu.classList.toggle("show");
  menuButton.setAttribute("aria-expanded", String(isOpen));
}

function closeMenu() {
  navMenu.classList.remove("show");
  menuButton.setAttribute("aria-expanded", "false");
}

function setError(inputElement, message) {
  if (!inputElement) return;
  const formGroup = inputElement.closest(".form-group");
  if (!formGroup) return;
  const errorElement = formGroup.querySelector(".error-message");
  inputElement.classList.add("input-error");
  if (errorElement) errorElement.textContent = message;
}

function clearError(inputElement) {
  if (!inputElement) return;
  const formGroup = inputElement.closest(".form-group");
  if (!formGroup) return;
  const errorElement = formGroup.querySelector(".error-message");
  inputElement.classList.remove("input-error");
  if (errorElement) errorElement.textContent = "";
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ============================================================================
  CLOUDFLARE TURNSTILE
  ----------------------------------------------------------------------------
  window.onTurnstileLoad is the callback named in index.html's script tag
  (`?onload=onTurnstileLoad&render=explicit`). Turnstile calls it once its
  own script has loaded; we render the widgets ourselves so we control
  exactly when and with which language/site key. There are two independent
  widgets now (booking form + contact form), tracked by name below.
  ============================================================================ */

const turnstileWidgets = {
  appointment: {
    widgetId: null,
    containerId: "turnstileWidget",
    errorElement: turnstileError,
  },
  contact: {
    widgetId: null,
    containerId: "contactTurnstileWidget",
    errorElement: contactTurnstileError,
  },
};

window.onTurnstileLoad = function onTurnstileLoad() {
  renderTurnstileWidget("appointment", false);
  renderTurnstileWidget("contact", false);
};

function renderTurnstileWidget(key, languageChanged) {
  if (!window.turnstile || !APP_CONFIG.TURNSTILE_SITE_KEY) return;
  const widget = turnstileWidgets[key];
  const container = document.getElementById(widget.containerId);
  if (!container) return;

  if (widget.widgetId !== null && languageChanged) {
    window.turnstile.remove(widget.widgetId);
    widget.widgetId = null;
    container.innerHTML = "";
  }

  if (widget.widgetId !== null) return;

  widget.widgetId = window.turnstile.render(container, {
    sitekey: APP_CONFIG.TURNSTILE_SITE_KEY,
    theme: "light",
    language: currentLanguage === "km" ? "km" : "en",
    callback: () => {
      if (widget.errorElement) widget.errorElement.textContent = "";
    },
    "expired-callback": () => {
      if (widget.errorElement) {
        widget.errorElement.textContent =
          translations[currentLanguage].msgTurnstileRequired;
      }
    },
    "error-callback": () => {
      if (widget.errorElement) {
        widget.errorElement.textContent =
          translations[currentLanguage].msgSpamDetected;
      }
    },
  });
}

function getTurnstileToken(key) {
  const widget = turnstileWidgets[key];
  if (!window.turnstile || widget.widgetId === null) return "";
  return window.turnstile.getResponse(widget.widgetId) || "";
}

function resetTurnstile(key) {
  const widget = turnstileWidgets[key];
  if (window.turnstile && widget.widgetId !== null) {
    window.turnstile.reset(widget.widgetId);
  }
}

/* ============================================================================
  APPOINTMENT BOOKING FORM
  ----------------------------------------------------------------------------
  Client-side validation here is a UX convenience only (fast feedback,
  fewer round trips) — the submit-appointment Edge Function repeats every
  check server-side and is the actual security boundary. See
  supabase/functions/_shared/validation.js.
  ============================================================================ */

// Maps a field name from the Edge Function's `fieldErrors` object to the
// input element that should show the message, and a field name from the
// client-side validator to the same. Kept in one place so both directions
// stay consistent.
function getFieldElement(fieldName) {
  switch (fieldName) {
    case "fullName":
      return document.getElementById("fullName");
    case "phone":
      return document.getElementById("phone");
    case "email":
      return document.getElementById("email");
    case "patientType":
      return document.getElementById("patientType");
    case "service":
      return document.getElementById("service");
    case "preferredDoctor":
      return document.getElementById("doctor");
    case "preferredDate":
      return document.getElementById("date");
    case "preferredTime":
      return document.getElementById("time");
    default:
      return null;
  }
}

const FIELD_ERROR_CODE_TO_KEY = {
  INVALID_NAME: "fieldErrorInvalidName",
  INVALID_PHONE: "fieldErrorInvalidPhone",
  INVALID_EMAIL: "fieldErrorInvalidEmail",
  INVALID_MESSAGE: "fieldErrorContactMessage",
  INVALID_PATIENT_TYPE: "fieldErrorInvalidPatientType",
  INVALID_SERVICE: "fieldErrorInvalidService",
  INVALID_DOCTOR: "fieldErrorInvalidDoctor",
  INVALID_DATE: "fieldErrorInvalidDate",
  DATE_IN_PAST: "fieldErrorDateInPast",
  DATE_TOO_FAR: "fieldErrorDateTooFar",
  INVALID_TIME: "fieldErrorInvalidTime",
  CONSENT_REQUIRED: "fieldErrorConsentRequired",
};

function clearAllAppointmentErrors() {
  [
    "fullName",
    "phone",
    "email",
    "patientType",
    "service",
    "otherServiceDetails",
    "doctor",
    "medicalCondition",
    "date",
    "time",
  ].forEach((id) => clearError(document.getElementById(id)));
  const consentErrorElement = document.getElementById("consentError");
  if (consentErrorElement) consentErrorElement.textContent = "";
  document.getElementById("consent")?.classList.remove("input-error");
}

function validateAppointmentFormClientSide() {
  let isValid = true;
  const t = translations[currentLanguage];

  clearAllAppointmentErrors();

  const fullName = document.getElementById("fullName");
  const phone = document.getElementById("phone");
  const email = document.getElementById("email");
  const patientType = document.getElementById("patientType");
  const service = document.getElementById("service");
  const doctor = document.getElementById("doctor");
  const date = document.getElementById("date");
  const time = document.getElementById("time");
  const consent = document.getElementById("consent");

  if (fullName.value.trim().length < 2) {
    setError(fullName, t.fieldErrorInvalidName);
    isValid = false;
  }

  if (phone.value.trim().length < 6) {
    setError(phone, t.fieldErrorInvalidPhone);
    isValid = false;
  }

  // Email is optional — only validate its format if the patient entered one.
  if (email.value.trim() && !isValidEmail(email.value.trim())) {
    setError(email, t.fieldErrorInvalidEmail);
    isValid = false;
  }

  if (!patientType.value) {
    setError(patientType, t.fieldErrorInvalidPatientType);
    isValid = false;
  }

  if (!service.value) {
    setError(service, t.fieldErrorInvalidService);
    isValid = false;
  } else if (
    service.value === "Other" &&
    !otherServiceDetailsInput.value.trim()
  ) {
    setError(otherServiceDetailsInput, t.fieldErrorOtherServiceRequired);
    isValid = false;
  }

  if (!doctor.value) {
    setError(doctor, t.fieldErrorInvalidDoctor);
    isValid = false;
  }

  if (!medicalConditionSelect.value) {
    setError(medicalConditionSelect, t.fieldErrorInvalidMedicalCondition);
    isValid = false;
  }

  if (!date.value) {
    setError(date, t.fieldErrorInvalidDate);
    isValid = false;
  }

  if (!time.value) {
    setError(time, t.fieldErrorInvalidTime);
    isValid = false;
  }

  if (!consent.checked) {
    document.getElementById("consentError").textContent =
      t.fieldErrorConsentRequired;
    consent.classList.add("input-error");
    isValid = false;
  }

  return isValid;
}

function setAppointmentSubmitting(isSubmitting) {
  const t = translations[currentLanguage];
  appointmentSubmitButton.disabled = isSubmitting;
  appointmentSubmitButton.textContent = isSubmitting
    ? t.submittingAppointment
    : t.submitAppointment;
}

function showAppointmentAlert(className, message) {
  appointmentAlert.className = `alert ${className}`;
  appointmentAlert.textContent = message;
}

/**
 * There is no dedicated medical-condition column in the database — see
 * BACKEND_PLAN.md's security checklist. Instead, whatever the patient
 * selects (and describes, for Allergies/Other) is folded into the same
 * capped free-text `message` field already sent to staff, exactly as if
 * they'd typed it into the message box themselves. The "Other" service's
 * description is folded in the same way, since `service` is a real
 * database enum with no free-text room of its own.
 */
function buildAppointmentMessage() {
  const baseMessage = document.getElementById("message").value.trim();
  const notes = [];

  if (serviceSelect.value === "Other") {
    const details = otherServiceDetailsInput.value.trim();
    if (details) notes.push(`Service requested: ${details}`);
  }

  const condition = medicalConditionSelect.value;
  if (condition && condition !== "none") {
    let conditionNote = `Medical condition: ${condition}`;
    if (["Allergies", "Other"].includes(condition)) {
      const conditionDetails = medicalConditionDetailsInput.value.trim();
      if (conditionDetails) conditionNote += ` — ${conditionDetails}`;
    }
    notes.push(conditionNote);
  }

  if (notes.length === 0) return baseMessage;

  const combined = baseMessage
    ? `${notes.join(". ")}. ${baseMessage}`
    : notes.join(". ");
  return combined.slice(0, 500);
}

async function handleAppointmentSubmit(event) {
  event.preventDefault();

  const t = translations[currentLanguage];

  if (!validateAppointmentFormClientSide()) {
    showAppointmentAlert("error-alert", t.msgValidationError);
    return;
  }

  const turnstileToken = getTurnstileToken("appointment");
  if (!turnstileToken) {
    if (turnstileError) turnstileError.textContent = t.msgTurnstileRequired;
    return;
  }
  if (turnstileError) turnstileError.textContent = "";

  const payload = {
    fullName: document.getElementById("fullName").value.trim(),
    phone: document.getElementById("phone").value.trim(),
    email: document.getElementById("email").value.trim(),
    patientType: document.getElementById("patientType").value,
    service: document.getElementById("service").value,
    preferredDoctor: document.getElementById("doctor").value,
    preferredDate: document.getElementById("date").value,
    preferredTime: document.getElementById("time").value,
    message: buildAppointmentMessage(),
    consent: document.getElementById("consent").checked,
    locale: currentLanguage,
    turnstileToken,
    // Honeypot — a real visitor never fills this in. See index.html.
    website: document.getElementById("website").value,
  };

  setAppointmentSubmitting(true);
  appointmentAlert.className = "alert";
  appointmentAlert.textContent = "";

  let response;
  let result;
  try {
    response = await fetch(APP_CONFIG.SUBMIT_APPOINTMENT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    result = await response.json().catch(() => ({}));
  } catch (networkError) {
    setAppointmentSubmitting(false);
    resetTurnstile("appointment");
    showAppointmentAlert("error-alert", t.msgNetworkError);
    return;
  }

  setAppointmentSubmitting(false);
  resetTurnstile("appointment");

  switch (result.code) {
    case "SUCCESS": {
      showAppointmentAlert(
        "success",
        `${t.msgSuccessPrefix} ${result.referenceNumber ?? ""}`.trim(),
      );
      appointmentForm.reset();
      clearAllAppointmentErrors();
      break;
    }
    case "VALIDATION_ERROR": {
      const fieldErrors = result.fieldErrors || {};
      Object.entries(fieldErrors).forEach(([field, errorCode]) => {
        if (field === "consent") {
          const consentErrorElement = document.getElementById("consentError");
          if (consentErrorElement) {
            consentErrorElement.textContent =
              t[FIELD_ERROR_CODE_TO_KEY[errorCode]] || t.msgValidationError;
          }
          document.getElementById("consent")?.classList.add("input-error");
          return;
        }
        const element = getFieldElement(field);
        const messageKey = FIELD_ERROR_CODE_TO_KEY[errorCode];
        setError(element, messageKey ? t[messageKey] : t.msgValidationError);
      });
      showAppointmentAlert("error-alert", t.msgValidationError);
      break;
    }
    case "SPAM_DETECTED":
      showAppointmentAlert("error-alert", t.msgSpamDetected);
      break;
    case "RATE_LIMITED":
      showAppointmentAlert("error-alert", t.msgRateLimited);
      break;
    case "DUPLICATE_SUBMISSION":
      showAppointmentAlert(
        "error-alert",
        `${t.msgDuplicatePrefix} ${result.referenceNumber ?? ""}`.trim(),
      );
      break;
    default:
      showAppointmentAlert("error-alert", t.msgServerError);
  }
}

/* ============================================================================
  CONTACT FORM
  ----------------------------------------------------------------------------
  Sends to the submit-contact Edge Function (same shape as the appointment
  booking flow above: Turnstile + honeypot + rate limiting server-side,
  never trusting the client-side checks below on their own). Messages land
  in the contact_messages table and are visible to staff on the dashboard.
  ============================================================================ */

function setContactSubmitting(isSubmitting) {
  const t = translations[currentLanguage];
  contactSubmitButton.disabled = isSubmitting;
  contactSubmitButton.textContent = isSubmitting
    ? t.submittingAppointment
    : t.sendMessageButton;
}

function validateContactFormClientSide() {
  const t = translations[currentLanguage];
  const contactName = document.getElementById("contactName");
  const contactEmail = document.getElementById("contactEmail");
  const contactMessage = document.getElementById("contactMessage");

  [contactName, contactEmail, contactMessage].forEach(clearError);
  let isValid = true;

  if (contactName.value.trim().length < 2) {
    setError(contactName, t.fieldErrorInvalidName);
    isValid = false;
  }

  if (!isValidEmail(contactEmail.value.trim())) {
    setError(contactEmail, t.fieldErrorInvalidEmail);
    isValid = false;
  }

  if (contactMessage.value.trim().length < 5) {
    setError(contactMessage, t.fieldErrorContactMessage);
    isValid = false;
  }

  return isValid;
}

const CONTACT_FIELD_TO_ELEMENT_ID = {
  fullName: "contactName",
  email: "contactEmail",
  message: "contactMessage",
};

async function handleContactSubmit(event) {
  event.preventDefault();
  const t = translations[currentLanguage];

  if (!validateContactFormClientSide()) {
    contactAlert.className = "alert error-alert";
    contactAlert.textContent = t.msgValidationError;
    return;
  }

  const turnstileToken = getTurnstileToken("contact");
  if (!turnstileToken) {
    if (contactTurnstileError) {
      contactTurnstileError.textContent = t.msgTurnstileRequired;
    }
    return;
  }
  if (contactTurnstileError) contactTurnstileError.textContent = "";

  const payload = {
    fullName: document.getElementById("contactName").value.trim(),
    email: document.getElementById("contactEmail").value.trim(),
    message: document.getElementById("contactMessage").value.trim(),
    turnstileToken,
    // Honeypot — a real visitor never fills this in. See index.html.
    website: document.getElementById("contactWebsite").value,
  };

  setContactSubmitting(true);
  contactAlert.className = "alert";
  contactAlert.textContent = "";

  let response;
  let result;
  try {
    response = await fetch(APP_CONFIG.SUBMIT_CONTACT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    result = await response.json().catch(() => ({}));
  } catch (networkError) {
    setContactSubmitting(false);
    resetTurnstile("contact");
    contactAlert.className = "alert error-alert";
    contactAlert.textContent = t.msgNetworkError;
    return;
  }

  setContactSubmitting(false);
  resetTurnstile("contact");

  switch (result.code) {
    case "SUCCESS":
      contactAlert.className = "alert success";
      contactAlert.textContent = t.msgContactSuccess;
      contactForm.reset();
      Object.values(CONTACT_FIELD_TO_ELEMENT_ID).forEach((id) =>
        clearError(document.getElementById(id)),
      );
      break;
    case "VALIDATION_ERROR": {
      const fieldErrors = result.fieldErrors || {};
      Object.entries(fieldErrors).forEach(([field, errorCode]) => {
        const elementId = CONTACT_FIELD_TO_ELEMENT_ID[field];
        const element = elementId ? document.getElementById(elementId) : null;
        const messageKey = FIELD_ERROR_CODE_TO_KEY[errorCode];
        setError(element, messageKey ? t[messageKey] : t.msgValidationError);
      });
      contactAlert.className = "alert error-alert";
      contactAlert.textContent = t.msgValidationError;
      break;
    }
    case "SPAM_DETECTED":
      contactAlert.className = "alert error-alert";
      contactAlert.textContent = t.msgSpamDetected;
      break;
    case "RATE_LIMITED":
      contactAlert.className = "alert error-alert";
      contactAlert.textContent = t.msgRateLimited;
      break;
    default:
      contactAlert.className = "alert error-alert";
      contactAlert.textContent = t.msgServerError;
  }
}

function renderTestimonial() {
  const testimonial = testimonials[currentTestimonialIndex];
  testimonialText.textContent = testimonial.text;
  testimonialService.textContent = testimonial.service;
}

function showNextTestimonial() {
  currentTestimonialIndex = (currentTestimonialIndex + 1) % testimonials.length;
  renderTestimonial();
}

function showPreviousTestimonial() {
  currentTestimonialIndex =
    (currentTestimonialIndex - 1 + testimonials.length) % testimonials.length;
  renderTestimonial();
}

function observeRevealElements() {
  const revealElements = document.querySelectorAll(".reveal");

  if (!("IntersectionObserver" in window)) {
    revealElements.forEach((element) => element.classList.add("visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 },
  );

  revealElements.forEach((element) => observer.observe(element));
}

menuButton.addEventListener("click", toggleMenu);

navMenu.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", closeMenu);
});

// Language toggle button listener lives in the LANGUAGE / i18n section above,
// next to applyLanguage() and the translations data it uses.

document.querySelectorAll(".filter-button").forEach((button) => {
  button.addEventListener("click", () => {
    const selectedFilter = button.dataset.filter;

    document.querySelectorAll(".filter-button").forEach((filterButton) => {
      filterButton.classList.remove("active");
    });

    button.classList.add("active");

    document.querySelectorAll(".service-card").forEach((card) => {
      const cardCategory = card.dataset.category;
      card.classList.toggle(
        "hidden",
        selectedFilter !== "all" && cardCategory !== selectedFilter,
      );
    });
  });
});

document.querySelectorAll(".book-service").forEach((button) => {
  button.addEventListener("click", () => {
    serviceSelect.value = button.dataset.service;
    updateOtherServiceDetailsVisibility();
    document.getElementById("booking").scrollIntoView({ behavior: "smooth" });
  });
});

document.querySelectorAll(".book-doctor").forEach((button) => {
  button.addEventListener("click", () => {
    doctorSelect.value = button.dataset.doctor;
    document.getElementById("booking").scrollIntoView({ behavior: "smooth" });
  });
});

function updateMedicalConditionDetailsVisibility() {
  const needsDetails = ["Allergies", "Other"].includes(
    medicalConditionSelect.value,
  );
  medicalConditionDetailsGroup.hidden = !needsDetails;
  if (!needsDetails) medicalConditionDetailsInput.value = "";
}

medicalConditionSelect.addEventListener(
  "change",
  updateMedicalConditionDetailsVisibility,
);
updateMedicalConditionDetailsVisibility();

function updateOtherServiceDetailsVisibility() {
  const needsDetails = serviceSelect.value === "Other";
  otherServiceDetailsGroup.hidden = !needsDetails;
  if (!needsDetails) otherServiceDetailsInput.value = "";
}

serviceSelect.addEventListener("change", updateOtherServiceDetailsVisibility);
updateOtherServiceDetailsVisibility();

appointmentForm.addEventListener("submit", handleAppointmentSubmit);
contactForm.addEventListener("submit", handleContactSubmit);
prevTestimonial.addEventListener("click", showPreviousTestimonial);
nextTestimonial.addEventListener("click", showNextTestimonial);

window.addEventListener("scroll", () => {
  backToTopButton.classList.toggle("show", window.scrollY > 420);
});

backToTopButton.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

init();
