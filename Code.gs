/**
 * AVP Holidays - Google Apps Script backend
 * Files required in the Apps Script project:
 *   1) Code.gs (this file)
 *   2) index.html
 *
 * This version supports:
 *   - Apps Script-hosted index.html via google.script.run
 *   - GitHub Pages frontend via JSONP endpoint (?action=ai...)
 */

function doGet(e) {
  var p = (e && e.parameter) || {};

  // GitHub Pages -> Apps Script -> Gemini
  // Content Service JSONP avoids the browser cross-origin problem
  // that occurs when google.script.run is used from GitHub Pages.
  if (p.action === 'ai') {
    var message = p.message || '';
    var history = [];

    try {
      history = p.history ? JSON.parse(p.history) : [];
    } catch (err) {
      history = [];
    }

    var reply = getAiReply(message, history);
    var payload = JSON.stringify({
      ok: true,
      reply: reply
    });

    var callback = p.callback || 'avpCallback';

    // Only allow a JavaScript identifier as the callback name.
    if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
      callback = 'avpCallback';
    }

    return ContentService
      .createTextOutput(callback + '(' + payload + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  // Normal Apps Script website
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('AVP Holidays | Flights, Hotels, Tours & Travel')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getAiReply(message, history) {
  message = String(message || '').trim();
  if (!message) return 'Please type your travel question and I’ll help you.';

  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('GEMINI_API_KEY');
  var model = props.getProperty('GEMINI_MODEL') || 'gemini-2.5-flash';

  if (!apiKey) return fallbackReply_(message);

  var systemPrompt = [
    'You are AVP Holidays AI, the friendly travel assistant for AVP Holidays.',
    'Company phone/WhatsApp: +1-888-393-2619.',
    'Help users with flights, hotels, travel packages, car rentals, cruises and general trip planning.',
    'Be concise, warm and professional. Do not invent live fares, availability, bookings, visa approvals, hotel inventory or airline policies.',
    'When a user wants a booking, collect the missing basics: origin, destination, dates, travelers and cabin/class.',
    'For hotel requests, ask destination, check-in, check-out and guests.',
    'For car rental, ask pickup city/location, dates/times and vehicle preference.',
    'For cruise, ask preferred destination/region, dates, travelers and cabin preference.',
    'If the user asks for a live quote or actual booking, tell them an AVP Holidays travel specialist can assist at +1-888-393-2619.',
    'Never claim a booking is completed unless the user has actually completed it through a supported booking flow.',
    'Keep answers suitable for a travel agency website chat widget.'
  ].join(' ');

  var recentHistory = Array.isArray(history) ? history.slice(-8) : [];
  var contents = recentHistory.map(function(item) {
    return {
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(item.text || '') }]
    };
  });

  contents.push({
    role: 'user',
    parts: [{ text: message }]
  });

  var url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) +
    ':generateContent?key=' +
    encodeURIComponent(apiKey);

  var payload = {
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: contents,
    generationConfig: {
      temperature: 0.55,
      maxOutputTokens: 500
    }
  };

  try {
    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var responseCode = response.getResponseCode();
    var data = JSON.parse(response.getContentText() || '{}');

    if (responseCode >= 200 && responseCode < 300) {
      var text = data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text;

      if (text) return text.trim();
    }

    console.error('Gemini API error: ' + response.getContentText());
    return fallbackReply_(message);

  } catch (err) {
    console.error(err);
    return fallbackReply_(message);
  }
}

function fallbackReply_(message) {
  var q = message.toLowerCase();

  if (/flight|fly|airline|ticket|fare|airport/.test(q)) {
    return 'Absolutely! ✈️ I can help you plan your flight. Please share your leaving city, destination, departure date, return date (if any), number of travelers and preferred class. For a live quote, call AVP Holidays at +1-888-393-2619.';
  }

  if (/hotel|stay|resort|room/.test(q)) {
    return 'Sure! 🏨 Please share your destination, check-in date, check-out date and number of guests. I can help you narrow down the right hotel options. For booking assistance, call +1-888-393-2619.';
  }

  if (/dubai|paris|switzerland|london|bali|singapore|japan|thailand|greece|rome|tokyo|bangkok/.test(q)) {
    return 'Great choice! 🌎 AVP Holidays can help with flights, hotels and complete holiday packages. Tell me your travel dates and number of travelers, and I’ll help you plan the trip.';
  }

  if (/car|rental|rent a car/.test(q)) {
    return '🚗 For a car rental, please share the pickup location, pickup date/time, return date/time and preferred vehicle type. AVP Holidays can help arrange the rental.';
  }

  if (/cruise|ship|cabin/.test(q)) {
    return '🛳️ I’d be happy to help with a cruise. Please tell me your preferred cruise region, dates, number of travelers and cabin preference. For assistance, call +1-888-393-2619.';
  }

  if (/visa|passport/.test(q)) {
    return '🛂 Visa and entry rules depend on nationality, destination and travel dates. Tell me the destination and your passport country, and I can help explain what information you should check. For personalized travel assistance, contact AVP Holidays at +1-888-393-2619.';
  }

  return 'Hi! 👋 Welcome to AVP Holidays. I can help with flights ✈️, hotels 🏨, holiday packages 🌎, car rentals 🚗 and cruises 🛳️. What trip are you planning?';
}
