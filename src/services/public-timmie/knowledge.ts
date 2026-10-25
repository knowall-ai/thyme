/**
 * Product knowledge for Ask Timmie, taken from Timmie's public content only: the
 * landing page (src/components/landing/LandingPage.tsx), the pricing page's plans and
 * FAQs (src/app/pricing/page.tsx), README.md, docs/FAQs.adoc and the user-facing parts
 * of docs/TROUBLESHOOTING.adoc. Nothing here is private: it is all on the public site or
 * in the open-source repository.
 *
 * When that copy changes, update this file too. Tests check that the pricing FAQ
 * questions and the landing page's feature titles below still appear in their sources.
 */

/** The pricing page's FAQs, word for word. */
export const PRICING_FAQ: { q: string; a: string }[] = [
  {
    q: 'Is Timmie really free?',
    a: 'Yes. Timmie is open source under the MIT licence, with every feature and no user limit. You only pay if you want us to host it or support you.',
  },
  {
    q: 'What do I need to run Timmie?',
    a: 'Microsoft Dynamics 365 Business Central with the Timmie BC Extension installed, and Business Central licences for your users. Self-hosting also needs an Azure subscription and an Entra ID app registration.',
  },
  {
    q: 'Where does my data live?',
    a: 'Time entries, timesheets and plans stay in your Business Central. Timmie reads and writes them there, so moving between self-hosted and hosted later has nothing to migrate.',
  },
  {
    q: 'What about the AI agent?',
    a: 'Hosted includes Timmie, our AI agent, which suggests time entries and reviews timesheets and plans. Self-hosted or supported, you can connect your own agent through the Timmie BC Extension.',
  },
  {
    q: 'How do payments work?',
    a: 'Hosting is priced in sats per user per month and paid with Bitcoin over the Lightning Network. If you need a fiat invoice, ask when you enquire.',
  },
  {
    q: 'What are Zaps?',
    a: 'An optional feature: approvers can send small Lightning tips to people who submit their timesheets on time. It works on every option.',
  },
];

/** The landing page's feature cards: title, then what it says. */
export const LANDING_FEATURES: { title: string; text: string }[] = [
  {
    title: 'Effortless Time Tracking',
    text: "Log hours in a weekly grid or with a timer, and see each day's billable % against your target. Hover over or tap an entry for its details.",
  },
  {
    title: 'AI Time Suggestions',
    text: 'The AI agent suggests entries from your calendar, GitHub and Azure DevOps activity, matched to the right project. Review each one before you add it.',
  },
  {
    title: 'Business Central Sync',
    text: 'Time goes straight into your Business Central projects and timesheets. Switch between companies, and share links that open the same company and page.',
  },
  {
    title: 'Timesheet Approvals',
    text: 'Review each submitted entry on its own row with its day, the daily hours and billable % against target, then approve the week in one click.',
  },
  {
    title: 'AI Timesheet Review',
    text: 'Before you approve, the AI agent flags missing comments, short days, the billable mix and budget overruns, with notes against the entries concerned.',
  },
  {
    title: 'Reports & Export',
    text: 'Report on year to date, last year or any range, by client and project, with hours split by stage. Print it or export to CSV.',
  },
  {
    title: 'Team Capacity & Targets',
    text: "Set each person's billable target and weekly capacity, including flexible working days, and see how complete everyone's timesheets are.",
  },
  {
    title: 'Resource Planning',
    text: 'Plan quarter-hour allocations by person, project and task. Over-capacity days show in red, under-capacity days in amber, and day notes mark off-sites.',
  },
  {
    title: 'AI Plan Review',
    text: "The AI agent checks each week's plan for billable targets, holidays, capacity and budget burn. If you can edit plans, apply its proposed changes in one click.",
  },
  {
    title: 'Project Forecasting',
    text: 'Track spend against the quoted estimate, forecast the outcome and finish date from planned hours, and break the time down by task.',
  },
  {
    title: 'Bitcoin Lightning Payments',
    text: 'Pay with Bitcoin via Lightning Network. Fixed pricing in Sats with instant, low-fee payments.',
  },
  {
    title: 'Zaps for Submissions',
    text: 'Encourage on-time timesheet submissions with optional Zaps (micro-Bitcoin payments via Lightning Network).',
  },
];

export const KNOWLEDGE = `
# What Timmie is
Timmie is time tracking for Microsoft Dynamics 365 Business Central, made by KnowAll AI. Log your time, plan your team and keep projects on budget, while an AI agent suggests entries and reviews timesheets and plans. It is a modern web app with a dark, responsive interface that works on desktop, tablet and phone. It is open source under the MIT licence: https://github.com/knowall-ai/timmie.
Time entries, timesheets and plans live in the customer's own Business Central, in their own Microsoft tenant. Timmie reads and writes them there; there is no separate Timmie database of time to migrate.
Sign-in is Microsoft sign-in (Microsoft Entra ID single sign-on). Customers sign in from the Timmie home page with "Get Started".

# Features (from the home page)
${LANDING_FEATURES.map((f) => `- ${f.title}: ${f.text}`).join('\n')}

# More detail on the features
- Weekly timesheet: enter time against projects and tasks in a weekly grid, or use the start and stop timer. See each day's and the week's billable percentage next to your personal target. Email your manager in one click if a week has no timesheet yet.
- Projects: compare time spent with the quoted estimate, see estimated spend to date, and forecast the outcome and finish date from planned hours. Chart spend in hours or days against an on-track line. Hours per task are split into Posted, Submitted and Unsubmitted. The projects list shows start and end dates and budget used by stage.
- Team and Plan: set each person's billable target and weekly capacity, including flexible working days. See how much of each person's capacity is logged. Plan quarter-hour allocations by person, project and task. Day notes such as "Company Off-Site" can mark days with no project work.
- Approvals and reports: approve or reject each submitted entry. Reports cover year to date, last year or a custom range, filtered by client and project, and export to CSV.
- The AI agent works alongside you: it proposes, you decide. It suggests time entries from your calendar, GitHub and Azure DevOps activity; a project can be linked to its repositories, DevOps projects, meeting keywords and attendee domains so the agent matches work to it. For approvers it flags missing comments, short days, the billable mix and budget overruns. On the Plan it gives a verdict for each week (billable targets, holidays, capacity, budget burn) and, if you can edit plans, you can apply a proposed change with one click.
- Platform: shareable links (every address includes the Business Central environment and company, so a link opens exactly what you were looking at), switching between Business Central companies and environments, and signing you in again automatically when your session expires.

# Why teams use it (from the home page)
Accurate client billing; fewer forgotten hours; cleaner timesheets to approve; plans that hit their targets; real-time project profitability; no more timesheet chasing; better resource forecasting; reduced admin (auto-sync removes double entry); a full history of entries and approvals; Microsoft Entra ID authentication and access control; your data stays in your Business Central environment; track time anywhere.

# Plans and pricing: /pricing
Every option has every feature.
- Self-hosted ("You run it, you support it"): free. Open source under the MIT licence; run it in your own Azure, connected to your own Business Central. Every feature, no user limit, your own Azure tenant and domain, connect your own AI agent, community support on GitHub.
- Hosted ("We run it, we support it"): priced in sats per user per month (the current price is on the pricing page). KnowAll runs Timmie for you on the Timmie website and sets your organisation up; you just install the Timmie BC Extension in Business Central. Every feature with no setup or servers, updates and monitoring by KnowAll, KnowAll's AI agent (time suggestions, timesheet and plan reviews), and email support from the team who build it.
- Support ("You run it, we support it"): tailored. Keep Timmie on your own infrastructure with KnowAll behind you: help installing and upgrading Timmie and the BC Extension, email support, help connecting your AI agent, and training and custom features on request.
- Hosting is priced in sats and paid with Bitcoin over the Lightning Network; the pricing page also shows today's equivalent in pounds, euros and dollars. Billing is by KnowAll AI SAS de CV, El Salvador. If you need a fiat invoice, ask when you enquire.
- To enquire about hosting, support, a demo or anything else, use the enquiry form on the pricing page: /pricing#enquire. KnowAll replies to enquiries sent there.

# What you need
- Microsoft Dynamics 365 Business Central, with the Timmie BC Extension installed (https://github.com/knowall-ai/timmie-bc-extension), and Business Central licences for your users.
- Self-hosting also needs an Azure subscription and an Entra ID app registration. Timmie is built with Next.js and React and is hosted on Azure App Service; the deployment guide is in the repository.
- Hosted Timmie is for organisations KnowAll has set up. Someone who signs in from an organisation that isn't set up yet sees "Your organisation isn't set up on Timmie yet"; they should enquire through the pricing page.

# How time works in Business Central
- A timesheet must exist in Business Central for a week before time can be entered; the timesheet manager creates it. Without one Timmie shows "No Timesheet Available".
- Each new time entry creates its own timesheet line in Business Central, even for the same project and task, so each can have its own notes. To add hours to an existing line, click the entry and change its hours.
- Timesheets become read-only once submitted for approval. A rejected timesheet can be reopened for editing. Submitted and approved timesheets can't be edited.
- To approve timesheets, a person must be a Time Sheet Admin in Business Central's User Setup, or the Time Sheet Approver on the Resource Card of the people they manage.
- People appear on the Team page when their Business Central resource is a Person, isn't blocked, uses time sheets and has a Time Sheet Owner User ID.
- Some features need a recent Timmie BC Extension (for example billable targets, weekly capacity, day notes, linked sources and the AI agent's suggestions and reviews). If something is missing, updating the extension is usually the fix.

# Common questions from the help page: /help
- "Timmie BC Extension is not installed": install it in Business Central from https://github.com/knowall-ai/timmie-bc-extension.
- "Could not find your resource record": your user needs a matching Resource record in Business Central with a valid email address; ask your Business Central administrator.
- "Your sign-in has expired": choose Sign in again. Timmie usually signs you in again by itself.
- "You don't have access to that company in Business Central": the link points at a company or environment your account can't see. Ask your Business Central administrator for access, or open the same page in your current company.
- A yellow banner saying Business Central isn't accepting requests: Microsoft's Business Central service is having problems; nothing needs fixing in Timmie and the banner clears itself.
- Hours shown as days (or the other way round): the person's resource needs an HOUR unit of measure set up in Business Central.
- A red outline on a Plan cell: the person is over-allocated that day across all projects.
- Messages about permissions (renaming or creating projects, billable targets, day notes): Business Central refused the change; ask a Business Central administrator for the permission.
- The full FAQs and troubleshooting guide are on the help page, /help.

# Legal pages
- End User License Agreement: /eula. Privacy policy: /privacy. Terms of service: /terms.
- KnowAll AI (https://knowall.ai) makes Timmie. The source code is MIT licensed.

# Useful links on this site
- Home page and sign in (existing customers): /
- Plans, pricing and the enquiry form: /pricing and /pricing#enquire
- Help, FAQs and troubleshooting: /help
- Legal: /eula, /privacy, /terms
- Source code: https://github.com/knowall-ai/timmie and the Business Central extension: https://github.com/knowall-ai/timmie-bc-extension
- KnowAll AI: https://knowall.ai

# Frequently asked questions (from the pricing page)
${PRICING_FAQ.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n')}
`.trim();
