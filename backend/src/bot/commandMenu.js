const CORE_COMMANDS = [
  { command: "start", description: "🏠 ပင်မစာမျက်နှာ ဖွင့်ရန်" },
  { command: "app", description: "📱 Mini App ဖွင့်ရန်" },
  { command: "key", description: "🔑 VPN Key ကြည့်ရန်" },
  { command: "balance", description: "📊 ဒေတာနှင့် သက်တမ်း စစ်ရန်" },
  { command: "buy", description: "🛒 ပက်ကေ့ဂျ် ဝယ်ယူရန်" },
  { command: "help", description: "💬 အကူအညီ ရယူရန်" },
];

export function getBotCommands(trialEnabled) {
  return trialEnabled
    ? [...CORE_COMMANDS, { command: "trial", description: "🎁 အခမဲ့ စမ်းသုံးရန်" }]
    : [...CORE_COMMANDS];
}

export function setCommandsMenu(telegram, chatId) {
  return telegram.setChatMenuButton({
    ...(chatId != null ? { chat_id: chatId } : {}),
    menu_button: { type: "commands" },
  });
}
