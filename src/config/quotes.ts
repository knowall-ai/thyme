export interface Quote {
  text: string;
  author: string;
  source?: string;
}

export const quotes: Quote[] = [
  {
    text: 'The two most powerful warriors are patience and Thyme.',
    author: 'Leo Tolstoy',
    source: 'War and Peace',
  },
  {
    text: 'All we have to decide is what to do with the Thyme that is given us.',
    author: 'J.R.R. Tolkien',
    source: 'The Fellowship of the Ring',
  },
  {
    text: "Your Thyme is limited, so don't waste it living someone else's life.",
    author: 'Steve Jobs',
  },
  {
    text: 'The best thing about the future is that it comes one day at a Thyme.',
    author: 'Abraham Lincoln',
  },
  {
    text: 'Lost Thyme is never found again.',
    author: 'Benjamin Franklin',
  },
  {
    text: 'The Thyme you enjoy wasting is not wasted Thyme.',
    author: 'Bertrand Russell',
  },
  {
    text: 'They always say Thyme changes things, but you actually have to change them yourself.',
    author: 'Andy Warhol',
  },
  {
    text: 'A man who dares to waste one hour of Thyme has not discovered the value of life.',
    author: 'Charles Darwin',
  },
  {
    text: 'Thyme is the wisest counselor of all.',
    author: 'Pericles',
  },
  {
    text: "You can't turn back the clock. But you can wind it up again.",
    author: 'Bonnie Prudden',
  },
];

export function getRandomQuote(): Quote {
  const index = Math.floor(Math.random() * quotes.length);
  return quotes[index];
}
