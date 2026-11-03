/*
 * Mission catalog. Each learning path (picked during onboarding) has three missions.
 * A mission is pure data: the AI plays the character, tracks the checklist and writes
 * feedback from these fields, so adding a mission needs no code changes.
 *
 * items[].check tells the AI exactly when a checklist item counts as done.
 * nudge / starters / keyText / keywords / model seed the three hint levels for the first turn;
 * after that, hints come from the AI for whatever the learner needs next.
 */

export const PATHS = [
  { id: 'food', label: 'Ordering food', place: 'Bluebird Burgers' },
  { id: 'shop', label: 'Shopping', place: 'Maple & Co.' },
  { id: 'dir', label: 'Asking directions', place: 'Old Town' },
  { id: 'hotel', label: 'Hotel check-in', place: 'Harbor Hotel' },
  { id: 'friend', label: 'Chatting with a friend', place: 'Corner Café' }
];

const JO = { name: 'Jo', initials: 'Jo', role: 'cashier', desc: 'Friendly. Speaks at normal speed. Will ask you to repeat if unsure.' };
const SAM = { name: 'Sam', initials: 'Sa', role: 'shop assistant', desc: 'Helpful and chatty. Will suggest things if you are unsure.' };
const PRIYA = { name: 'Priya', initials: 'Pr', role: 'local resident', desc: 'Kind, a little busy. Gives directions with landmarks.' };
const RAY = { name: 'Ray', initials: 'Ra', role: 'ticket clerk', desc: 'Polite and quick. Uses short questions.' };
const MARCO = { name: 'Marco', initials: 'Ma', role: 'front desk agent', desc: 'Professional and warm. Will spell things out if you ask.' };
const ALEX = { name: 'Alex', initials: 'Al', role: 'new friend', desc: 'Relaxed and curious. Asks you questions back.' };

const FOOD_MENU = [
  ['Chicken sandwich', '$6.49'], ['Cheeseburger', '$5.99'], ['Veggie wrap', '$6.29'],
  ['Fries · S / M / L', '2.29 / 2.89 / 3.39'], ['Soda · S / M / L', '1.49 / 1.89 / 2.19']
];
const FOOD_FACTS = 'Menu: chicken sandwich $6.49, cheeseburger $5.99, veggie wrap $6.29 (grilled vegetables, hummus, a little spicy sauce that can be left out), fries small $2.29 / medium $2.89 / large $3.39, soda small $1.49 / medium $1.89 / large $2.19. Sauces: ketchup, mayo, barbecue (free). Tax is about 4%.';

export const MISSIONS = [
  /* ---------------- Ordering food ---------------- */
  {
    id: 'food-1', path: 'food', n: 1, title: 'Order a meal', minutes: 2, character: JO, place: 'Bluebird Burgers',
    goal: 'Order a chicken sandwich and medium fries.',
    items: [
      { id: 'main', label: 'Chicken sandwich', sub: 'Use the menu name', check: 'The learner asked for the chicken sandwich. Accept "chicken", "chicken burger" or a yes to Jo offering it.' },
      { id: 'fries', label: 'Medium fries', sub: 'Say the size', check: 'The learner asked for fries AND said the size medium (or agreed to medium).' }
    ],
    board: { title: 'MENU BOARD', rows: FOOD_MENU },
    facts: FOOD_FACTS,
    opening: 'Hi there! What can I get for you today?',
    script: 'Ask for anything missing one thing at a time: the food, then fries, then the size. If they pick a different item, go along with it politely; the coach tip shows how to change it. When the order matches the goal, repeat it back and say the total ($9.38).',
    followUp: '',
    tags: ['Jo, cashier'],
    newPhrase: '“I’d like ___, please.”',
    model: 'I’d like a chicken sandwich and medium fries, please.',
    prompt: 'Tell Jo your order',
    nudge: 'Tell Jo the two things you want: the sandwich and the fries.', starters: ['I’d like…', 'Can I get…'],
    keyText: 'Use the menu words and give the size.', keywords: ['a chicken sandwich', 'medium fries', 'please'],
    samples: ['I want a chicken burger and medium fries.', 'Sandwich and fries.', 'Hi, I’d like a chicken sandwich and medium fries, please.']
  },
  {
    id: 'food-2', path: 'food', n: 2, title: 'Change your order', minutes: 3, character: JO, place: 'Bluebird Burgers',
    goal: 'Jo repeats your order. Change the fries to large and add a medium soda.',
    items: [
      { id: 'fries', label: 'Large fries', sub: 'Change the size', check: 'The learner asked to change the fries to large.' },
      { id: 'soda', label: 'Medium soda', sub: 'Add a drink with a size', check: 'The learner added a soda (any soft drink) AND said medium.' },
      { id: 'place', label: 'For here or to go', sub: 'Answer Jo’s follow-up', check: 'The learner answered Jo’s follow-up question "For here or to go?" (either answer counts). Only possible after Jo asked it.' }
    ],
    board: { title: 'YOUR ORDER SO FAR', rows: [['Chicken sandwich', '$6.49'], ['Fries · medium', '$2.89'], ['Soda · S / M / L', '1.49 / 1.89 / 2.19']] },
    facts: FOOD_FACTS + ' The learner already ordered one chicken sandwich and medium fries.',
    opening: 'Welcome back! So that’s one chicken sandwich and medium fries. Any changes?',
    script: 'Handle the changes. Ask about anything missing (the fries, the drink, the drink size). Only after BOTH changes are done, ask the follow-up: "For here or to go?". After they answer, close warmly (e.g. "Great, your order will be ready in a few minutes!").',
    followUp: 'Jo asks a follow-up',
    tags: ['Jo asks a follow-up'],
    newPhrase: '“Could I change ___ to ___?”',
    model: 'Could I change the fries to large and add a medium soda, please?',
    prompt: 'Tell Jo your two changes',
    nudge: 'Two changes: the fries and a drink. Start politely.', starters: ['Could I…', 'I’d like…'],
    keyText: 'Fries → large. Add a medium soda.', keywords: ['change the fries to large', 'add a medium soda', 'please'],
    samples: ['Could I change the fries to large and add a medium soda, please?', 'I want large fries and soda.']
  },
  {
    id: 'food-3', path: 'food', n: 3, title: 'Ask about the menu', minutes: 3, character: JO, place: 'Bluebird Burgers',
    goal: 'Ask what is in the veggie wrap and if it is spicy, then order one.',
    items: [
      { id: 'ask', label: 'What’s in it?', sub: 'Ask about the wrap', check: 'The learner asked what is in the veggie wrap (ingredients).' },
      { id: 'spicy', label: 'Is it spicy?', sub: 'Ask a yes/no question', check: 'The learner asked whether the wrap is spicy (or about the sauce/heat).' },
      { id: 'order', label: 'Order the wrap', sub: 'Then answer Jo', check: 'The learner ordered one veggie wrap AND answered Jo’s follow-up question about a sauce or drink.' }
    ],
    board: { title: 'MENU BOARD', rows: FOOD_MENU },
    facts: FOOD_FACTS,
    opening: 'Hi again! Ready to order, or do you have any questions about the menu?',
    script: 'Answer menu questions simply and truthfully using the facts. When the learner orders the wrap, ask TWO follow-up questions, one at a time: "Would you like any sauce with that?" and then "Anything to drink?". Close warmly after they answer.',
    followUp: 'Jo asks two follow-ups',
    tags: ['Jo asks two follow-ups'],
    newPhrase: '“What’s in the ___?” / “Is it ___?”',
    model: 'Excuse me, what’s in the veggie wrap? Is it spicy?',
    prompt: 'Ask Jo about the veggie wrap',
    nudge: 'Ask Jo two questions about the veggie wrap before you order.', starters: ['Excuse me…', 'What’s in…'],
    keyText: 'Questions start with “What” or “Is it”.', keywords: ['what’s in the veggie wrap', 'is it spicy'],
    samples: ['Excuse me, what’s in the veggie wrap? Is it spicy?', 'Veggie wrap, what inside?']
  },

  /* ---------------- Shopping ---------------- */
  {
    id: 'shop-1', path: 'shop', n: 1, title: 'Find your size', minutes: 2, character: SAM, place: 'Maple & Co.',
    goal: 'Ask Sam for a blue T-shirt in medium.',
    items: [
      { id: 'item', label: 'Blue T-shirt', sub: 'Say the color', check: 'The learner asked for a T-shirt and said blue.' },
      { id: 'size', label: 'Size medium', sub: 'Say your size', check: 'The learner said they need size medium (M).' }
    ],
    board: { title: 'TODAY IN STORE', rows: [['T-shirts · S / M / L', '$15'], ['Colors', 'blue, white, black'], ['Hoodies', '$35'], ['Jeans', '$40']] },
    facts: 'Clothing store. T-shirts $15 in blue, white, black, sizes S, M, L. Blue medium is in stock on the shelf by the window. Hoodies $35, jeans $40. Fitting rooms at the back.',
    opening: 'Hi! Welcome to Maple and Co. Are you looking for anything special today?',
    script: 'Help them find it: ask about color or size if missing. When both are clear, say where it is and offer the fitting room.',
    followUp: '', tags: ['Sam, shop assistant'],
    newPhrase: '“I’m looking for ___.”', model: 'Hi, I’m looking for a blue T-shirt in medium, please.',
    prompt: 'Tell Sam what you need',
    nudge: 'Tell Sam the thing you want, the color and your size.', starters: ['I’m looking for…', 'Do you have…'],
    keyText: 'Color before the thing: “a blue T-shirt”.', keywords: ['a blue T-shirt', 'in medium', 'please'],
    samples: ['Hi, I’m looking for a blue T-shirt in medium, please.', 'T-shirt blue, medium.']
  },
  {
    id: 'shop-2', path: 'shop', n: 2, title: 'Try it on and pay', minutes: 3, character: SAM, place: 'Maple & Co.',
    goal: 'Ask to try the T-shirt on, ask the price, then answer how you’ll pay.',
    items: [
      { id: 'try', label: 'Try it on', sub: 'Ask permission', check: 'The learner asked if they can try it on / use the fitting room.' },
      { id: 'price', label: 'Ask the price', sub: '“How much…?”', check: 'The learner asked how much it costs.' },
      { id: 'pay', label: 'Card or cash', sub: 'Answer Sam’s follow-up', check: 'The learner answered Sam’s question about paying by card or cash.' }
    ],
    board: { title: 'TODAY IN STORE', rows: [['T-shirts', '$15'], ['Sale', '2 for $25'], ['Fitting rooms', 'at the back']] },
    facts: 'The learner is holding a blue T-shirt, size medium. Price $15, or 2 for $25 today. Fitting rooms are at the back on the left.',
    opening: 'Did you find everything okay?',
    script: 'Answer their questions. After they ask the price, mention the 2-for-$25 deal. Then ask the follow-up: "Will that be card or cash?". Close warmly after they answer.',
    followUp: 'Sam asks a follow-up', tags: ['Sam asks a follow-up'],
    newPhrase: '“Can I try this on?” / “How much is it?”', model: 'Can I try this on, please? And how much is it?',
    prompt: 'Ask Sam two questions',
    nudge: 'Ask Sam if you can try it on, and how much it costs.', starters: ['Can I…', 'How much…'],
    keyText: 'Use “try on” and “how much”.', keywords: ['try this on', 'how much is it'],
    samples: ['Can I try this on, please? And how much is it?', 'Try on? How much?']
  },
  {
    id: 'shop-3', path: 'shop', n: 3, title: 'Return an item', minutes: 3, character: SAM, place: 'Maple & Co.',
    goal: 'Return jeans that are too small. Say why, and ask for a bigger size.',
    items: [
      { id: 'return', label: 'Say you want to return', sub: 'Name the item', check: 'The learner said they want to return (or bring back) the jeans.' },
      { id: 'reason', label: 'Give the reason', sub: 'They’re too small', check: 'The learner explained the jeans are too small / don’t fit.' },
      { id: 'exchange', label: 'Ask for a bigger size', sub: 'Then answer Sam', check: 'The learner asked to exchange for a bigger size AND answered Sam’s follow-up about the receipt.' }
    ],
    board: { title: 'RETURNS', rows: [['Returns', 'within 30 days'], ['Need', 'receipt'], ['Jeans', 'sizes 28 – 36']] },
    facts: 'The learner bought jeans size 30 last week; they are too small. Size 32 is in stock. Returns need a receipt; the learner has it on their phone.',
    opening: 'Hi there, how can I help you?',
    script: 'Be understanding. Ask for the reason if missing. When they ask for a bigger size, say size 32 is in stock and ask the follow-up: "Do you have your receipt?". Close warmly after they answer.',
    followUp: 'Sam asks for the receipt', tags: ['Sam asks a follow-up'],
    newPhrase: '“I’d like to return ___. It’s too ___.”', model: 'Hi, I’d like to return these jeans. They’re too small. Could I get a bigger size?',
    prompt: 'Tell Sam why you’re here',
    nudge: 'Say what you want to return and why.', starters: ['I’d like to return…', 'These are…'],
    keyText: 'Use “too small” and “a bigger size”.', keywords: ['return these jeans', 'too small', 'a bigger size'],
    samples: ['Hi, I’d like to return these jeans. They’re too small.', 'Jeans small. Change.']
  },

  /* ---------------- Asking directions ---------------- */
  {
    id: 'dir-1', path: 'dir', n: 1, title: 'Find the station', minutes: 2, character: PRIYA, place: 'Old Town',
    goal: 'Stop Priya politely and ask the way to Central Station.',
    items: [
      { id: 'polite', label: 'Get attention', sub: '“Excuse me…”', check: 'The learner opened politely, e.g. "Excuse me" or "Sorry".' },
      { id: 'ask', label: 'Ask the way', sub: 'Name the place', check: 'The learner asked how to get to Central Station.' },
      { id: 'confirm', label: 'Check you understood', sub: 'Repeat a step', check: 'The learner repeated or confirmed part of the directions (e.g. "Left at the bank?").' }
    ],
    board: { title: 'STREET MAP', rows: [['You are here', 'Market Square'], ['Central Station', '5 min walk'], ['Landmarks', 'bank, park']] },
    facts: 'From Market Square: go straight down King Street, turn left at the bank, the station is across from the park. About 5 minutes on foot.',
    opening: 'Oh, hi! Can I help you? You look a little lost.',
    script: 'Give the directions in two short steps. If the learner does not confirm, ask "Is that clear?". When they repeat a step correctly, say yes and wish them a good day.',
    followUp: '', tags: ['Priya, a local'],
    newPhrase: '“Excuse me, how do I get to ___?”', model: 'Excuse me, how do I get to Central Station?',
    prompt: 'Ask Priya the way',
    nudge: 'Start politely, then name the place you want to go.', starters: ['Excuse me…', 'How do I get to…'],
    keyText: 'Say the full place name.', keywords: ['excuse me', 'how do I get to', 'Central Station'],
    samples: ['Excuse me, how do I get to Central Station?', 'Station where?']
  },
  {
    id: 'dir-2', path: 'dir', n: 2, title: 'How far is it?', minutes: 3, character: PRIYA, place: 'Old Town',
    goal: 'Ask how long it takes to walk to the museum and whether there’s a bus.',
    items: [
      { id: 'time', label: 'How long?', sub: 'Ask about time', check: 'The learner asked how long it takes / how far it is to the museum.' },
      { id: 'bus', label: 'Is there a bus?', sub: 'Ask about another way', check: 'The learner asked about a bus (or other transport).' },
      { id: 'choose', label: 'Decide', sub: 'Answer Priya', check: 'The learner answered Priya’s follow-up question about whether they will walk or take the bus.' }
    ],
    board: { title: 'STREET MAP', rows: [['City Museum', '20 min walk'], ['Bus 12', 'every 10 min'], ['Stop', 'outside the bakery']] },
    facts: 'The City Museum is a 20-minute walk. Bus number 12 goes there every 10 minutes from the stop outside the bakery; it takes 5 minutes; tickets $2 on the bus.',
    opening: 'Hi again! Where are you off to now?',
    script: 'Answer each question with a number. After both questions, ask the follow-up: "So, will you walk or take the bus?". Close warmly.',
    followUp: 'Priya asks a follow-up', tags: ['Priya asks a follow-up'],
    newPhrase: '“How long does it take to ___?”', model: 'How long does it take to walk to the museum? Is there a bus?',
    prompt: 'Ask Priya about the museum',
    nudge: 'Ask about time first, then ask about a bus.', starters: ['How long…', 'Is there…'],
    keyText: 'Use “does it take” and “a bus”.', keywords: ['how long does it take', 'to the museum', 'is there a bus'],
    samples: ['How long does it take to walk to the museum?', 'Museum far? Bus?']
  },
  {
    id: 'dir-3', path: 'dir', n: 3, title: 'Buy a train ticket', minutes: 3, character: RAY, place: 'Central Station',
    goal: 'Buy a return ticket to Riverside and ask which platform.',
    items: [
      { id: 'ticket', label: 'Return ticket', sub: 'Say the type', check: 'The learner asked for a return (round-trip) ticket.' },
      { id: 'dest', label: 'To Riverside', sub: 'Say where', check: 'The learner said the destination Riverside.' },
      { id: 'platform', label: 'Which platform?', sub: 'Ask before you go', check: 'The learner asked which platform (or where the train leaves from).' }
    ],
    board: { title: 'DEPARTURES', rows: [['Riverside', '10:40 · Platform 4'], ['Single', '$8.50'], ['Return', '$14.00']] },
    facts: 'Next train to Riverside 10:40 from platform 4. Single $8.50, return $14.00. Card payment only at this window.',
    opening: 'Next, please! Where are you traveling today?',
    script: 'Ask for anything missing (destination, single or return). Say the price and next time. If they don’t ask about the platform, wait; do not volunteer it. When they ask, answer and close.',
    followUp: '', tags: ['Ray, ticket clerk'],
    newPhrase: '“A return ticket to ___, please.”', model: 'A return ticket to Riverside, please. Which platform is it?',
    prompt: 'Tell Ray what you need',
    nudge: 'Say the ticket type and where you’re going.', starters: ['A return ticket…', 'Could I get…'],
    keyText: '“Return” means there and back.', keywords: ['a return ticket', 'to Riverside', 'which platform'],
    samples: ['A return ticket to Riverside, please.', 'Riverside, two way.']
  },

  /* ---------------- Hotel check-in ---------------- */
  {
    id: 'hotel-1', path: 'hotel', n: 1, title: 'Check in', minutes: 2, character: MARCO, place: 'Harbor Hotel',
    goal: 'Check in under your name for two nights.',
    items: [
      { id: 'res', label: 'Your reservation', sub: '“I have a reservation”', check: 'The learner said they have a reservation / booking.' },
      { id: 'name', label: 'Give your name', sub: 'Spell it if asked', check: 'The learner gave the name on the booking.' },
      { id: 'nights', label: 'Two nights', sub: 'Confirm the stay', check: 'The learner confirmed the stay is two nights.' }
    ],
    board: { title: 'YOUR BOOKING', rows: [['Room', 'Double, sea view'], ['Stay', '2 nights'], ['Breakfast', '7 – 10 am']] },
    facts: 'The learner has a booking for a double room with sea view, two nights. Breakfast 7–10 am in the lobby restaurant. Wi-Fi password: harbor2026. Room 412.',
    opening: 'Good evening, welcome to the Harbor Hotel. How can I help you?',
    script: 'Ask for the name, then confirm the number of nights. When all is done, give the room number and wish them a nice stay.',
    followUp: '', tags: ['Marco, front desk'],
    newPhrase: '“I have a reservation under ___.”', model: 'Hi, I have a reservation under the name {name}, for two nights.',
    prompt: 'Tell Marco why you’re here',
    nudge: 'Say you have a booking and give your name.', starters: ['I have a reservation…', 'Hi, I’m checking in…'],
    keyText: 'Use “under the name” and “for two nights”.', keywords: ['a reservation', 'under the name', 'for two nights'],
    samples: ['Hi, I have a reservation for two nights.', 'Booking. My name.']
  },
  {
    id: 'hotel-2', path: 'hotel', n: 2, title: 'Ask for help', minutes: 3, character: MARCO, place: 'Harbor Hotel',
    goal: 'Call the front desk: ask for extra towels and the Wi-Fi password.',
    items: [
      { id: 'towels', label: 'Extra towels', sub: 'Make a request', check: 'The learner asked for extra towels.' },
      { id: 'wifi', label: 'Wi-Fi password', sub: 'Ask a question', check: 'The learner asked for the Wi-Fi password.' },
      { id: 'room', label: 'Room number', sub: 'Answer Marco', check: 'The learner answered Marco’s follow-up by giving their room number (412).' }
    ],
    board: { title: 'ROOM 412', rows: [['Front desk', 'dial 0'], ['Wi-Fi', 'ask the desk'], ['Checkout', '11 am']] },
    facts: 'The learner is in room 412. Wi-Fi password: harbor2026. Towels can be brought up in 10 minutes.',
    opening: 'Front desk, Marco speaking. How can I help?',
    script: 'Help with each request. Before sending towels, ask the follow-up: "What’s your room number, please?". Close warmly.',
    followUp: 'Marco asks a follow-up', tags: ['Marco asks a follow-up'],
    newPhrase: '“Could I have ___, please?”', model: 'Hi, could I have some extra towels, please? And what’s the Wi-Fi password?',
    prompt: 'Tell Marco what you need',
    nudge: 'Two things: towels and the Wi-Fi password.', starters: ['Could I have…', 'What’s the…'],
    keyText: 'Use “extra towels” and “Wi-Fi password”.', keywords: ['some extra towels', 'the Wi-Fi password', 'please'],
    samples: ['Could I have some extra towels, please?', 'Towel more. Wi-Fi?']
  },
  {
    id: 'hotel-3', path: 'hotel', n: 3, title: 'Report a problem', minutes: 3, character: MARCO, place: 'Harbor Hotel',
    goal: 'The air conditioning is broken. Explain the problem and ask to change rooms.',
    items: [
      { id: 'problem', label: 'Explain the problem', sub: 'What’s wrong?', check: 'The learner said the air conditioning (AC) is not working.' },
      { id: 'change', label: 'Ask to change rooms', sub: 'Make a polite request', check: 'The learner asked to move to / change to another room.' },
      { id: 'time', label: 'When to move', sub: 'Answer Marco', check: 'The learner answered Marco’s follow-up about when they would like to move.' }
    ],
    board: { title: 'ROOM 412', rows: [['Problem', 'AC not working'], ['Free rooms', '305, 518'], ['Front desk', 'dial 0']] },
    facts: 'Room 412 AC is broken. Rooms 305 and 518 are free. A technician could come in 1 hour instead.',
    opening: 'Front desk, Marco speaking. How can I help?',
    script: 'Apologize. If they only describe the problem, offer a technician in one hour; let them ask for a new room. When they ask, offer room 518 and ask the follow-up: "When would you like to move?". Close warmly.',
    followUp: 'Marco asks a follow-up', tags: ['Marco asks a follow-up'],
    newPhrase: '“The ___ isn’t working.”', model: 'Hi, the air conditioning in my room isn’t working. Could I change rooms, please?',
    prompt: 'Explain the problem to Marco',
    nudge: 'Say what is broken, then ask for a different room.', starters: ['The air conditioning…', 'Could I…'],
    keyText: 'Use “isn’t working” and “change rooms”.', keywords: ['isn’t working', 'change rooms', 'please'],
    samples: ['Hi, the air conditioning isn’t working. Could I change rooms?', 'Air con broken.']
  },

  /* ---------------- Chatting with a friend ---------------- */
  {
    id: 'friend-1', path: 'friend', n: 1, title: 'Introduce yourself', minutes: 3, character: ALEX, place: 'Corner Café',
    goal: 'Meet Alex at a language meetup. Say your name, where you’re from and what you do.',
    items: [
      { id: 'name', label: 'Your name', sub: 'Say hello', check: 'The learner said their name.' },
      { id: 'from', label: 'Where you’re from', sub: 'Country or city', check: 'The learner said where they are from.' },
      { id: 'job', label: 'What you do', sub: 'Work or study', check: 'The learner said what they do (job or studies).' }
    ],
    board: { title: 'MEETUP', rows: [['Where', 'Corner Café'], ['Who', 'Alex, a designer'], ['Tip', 'ask a question back']] },
    facts: 'Alex is a graphic designer from Toronto who moved here two years ago. Loves hiking and cooking.',
    opening: 'Hi! I’m Alex. Is this your first time at the meetup?',
    script: 'Be friendly and curious. Ask about whatever is missing (name, where from, what they do) one at a time, sharing a little about yourself each time. Close warmly when all is done.',
    followUp: '', tags: ['Alex, new friend'],
    newPhrase: '“I’m from ___. I work as ___.”', model: 'Yes, it is! I’m {name}. I’m from ___, and I work as a ___.',
    prompt: 'Introduce yourself to Alex',
    nudge: 'Answer Alex, then say your name.', starters: ['Yes, it is!', 'Nice to meet you…'],
    keyText: 'Use “I’m from” and “I work as” or “I study”.', keywords: ['I’m from', 'I work as', 'nice to meet you'],
    samples: ['Yes, it is! Nice to meet you, I’m Mei.', 'Yes. Me Mei.']
  },
  {
    id: 'friend-2', path: 'friend', n: 2, title: 'Make plans', minutes: 3, character: ALEX, place: 'Corner Café',
    goal: 'Suggest doing something together this weekend, and agree on a day and a time.',
    items: [
      { id: 'suggest', label: 'Suggest a plan', sub: '“Would you like to…?”', check: 'The learner suggested an activity to do together.' },
      { id: 'day', label: 'Pick a day', sub: 'Saturday or Sunday', check: 'The learner agreed on or proposed a specific day.' },
      { id: 'time', label: 'Pick a time', sub: 'Answer Alex', check: 'The learner answered Alex’s follow-up about what time / where to meet.' }
    ],
    board: { title: 'THIS WEEKEND', rows: [['Saturday', 'Alex is free after 2 pm'], ['Sunday', 'Alex is free all day'], ['Ideas', 'movie, hike, market']] },
    facts: 'Alex is busy Saturday morning, free Saturday after 2 pm and all Sunday. Alex likes hiking, the farmers market and movies.',
    opening: 'So, any plans for the weekend?',
    script: 'React with enthusiasm to their suggestion. If they suggest Saturday morning, say you are busy then. Once a day is agreed, ask the follow-up: "What time should we meet?". Close warmly.',
    followUp: 'Alex asks a follow-up', tags: ['Alex asks a follow-up'],
    newPhrase: '“Would you like to ___?”', model: 'Not yet! Would you like to go to the market on Sunday?',
    prompt: 'Suggest a plan to Alex',
    nudge: 'Invite Alex to do something with you.', starters: ['Would you like to…', 'How about…'],
    keyText: 'Name an activity and a day.', keywords: ['would you like to', 'go to the market', 'on Sunday'],
    samples: ['Would you like to see a movie on Sunday?', 'Sunday movie?']
  },
  {
    id: 'friend-3', path: 'friend', n: 3, title: 'Talk about hobbies', minutes: 3, character: ALEX, place: 'Corner Café',
    goal: 'Tell Alex about a hobby, say why you like it, and ask Alex a question back.',
    items: [
      { id: 'hobby', label: 'Name a hobby', sub: '“I like…”', check: 'The learner named a hobby or free-time activity.' },
      { id: 'why', label: 'Say why', sub: 'Use “because”', check: 'The learner gave a reason they like it.' },
      { id: 'ask', label: 'Ask Alex back', sub: 'Keep it going', check: 'The learner asked Alex a question about Alex’s hobbies or life.' }
    ],
    board: { title: 'TALK TIPS', rows: [['Start', 'I really like…'], ['Reason', '…because…'], ['Ask back', 'What about you?']] },
    facts: 'Alex loves hiking and cooking Korean food; recently tried rock climbing.',
    opening: 'So what do you like to do in your free time?',
    script: 'Show interest and ask "Why do you like it?" if they give no reason. Wait for them to ask you something; if they don’t after two turns, the coach tip suggests "What about you?". Answer their question and close warmly.',
    followUp: '', tags: ['Alex, new friend'],
    newPhrase: '“I really like ___ because ___.”', model: 'I really like cooking because it helps me relax. What about you?',
    prompt: 'Tell Alex about your hobby',
    nudge: 'Name something you enjoy doing.', starters: ['I really like…', 'In my free time…'],
    keyText: 'Add a reason with “because”.', keywords: ['I really like', 'because', 'what about you'],
    samples: ['I really like cooking because it helps me relax.', 'Cooking. I like.']
  }
];

export const byId = id => MISSIONS.find(m => m.id === id);
export const pathMissions = path => MISSIONS.filter(m => m.path === path).sort((a, b) => a.n - b.n);

/* The parts of a mission the browser needs (no AI-only fields). */
export function publicMission(m, name) {
  const fill = s => (s || '').replace(/\{name\}/g, name || 'Mei');
  return {
    id: m.id, path: m.path, n: m.n, title: m.title, minutes: m.minutes, place: m.place,
    character: m.character, goal: m.goal,
    items: m.items.map(i => ({ id: i.id, label: i.label, sub: i.sub })),
    board: m.board, opening: m.opening, followUp: m.followUp, tags: m.tags, newPhrase: m.newPhrase,
    model: fill(m.model), prompt: m.prompt, samples: m.samples.map(fill),
    openingHints: [
      { text: m.nudge, chips: m.starters },
      { text: m.keyText, chips: m.keywords },
      { text: 'Say it like this. Tap to hear it, then try it yourself.', chips: [fill(m.model)] }
    ]
  };
}
