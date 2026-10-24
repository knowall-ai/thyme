export interface Quote {
  text: string;
  author: string;
  source?: string;
}

export const quotes: Quote[] = [
  {
    text: 'The two most powerful warriors are patience and time.',
    author: 'Leo Tolstoy',
    source: 'War and Peace',
  },
  {
    text: 'All we have to decide is what to do with the time that is given us.',
    author: 'J.R.R. Tolkien',
    source: 'The Fellowship of the Ring',
  },
  {
    text: "Your time is limited, so don't waste it living someone else's life.",
    author: 'Steve Jobs',
  },
  {
    text: 'The best thing about the future is that it comes one day at a time.',
    author: 'Abraham Lincoln',
  },
  {
    text: 'Lost time is never found again.',
    author: 'Benjamin Franklin',
  },
  {
    text: 'The time you enjoy wasting is not wasted time.',
    author: 'Bertrand Russell',
  },
  {
    text: 'They always say time changes things, but you actually have to change them yourself.',
    author: 'Andy Warhol',
  },
  {
    text: 'A man who dares to waste one hour of time has not discovered the value of life.',
    author: 'Charles Darwin',
  },
  {
    text: 'Time is the wisest counselor of all.',
    author: 'Pericles',
  },
  {
    text: "You can't turn back the time. But you can wind it up again.",
    author: 'Bonnie Prudden',
  },
];

export function getRandomQuote(): Quote {
  const index = Math.floor(Math.random() * quotes.length);
  return quotes[index];
}
