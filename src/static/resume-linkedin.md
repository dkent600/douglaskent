# LinkedIn transfer — paste-ready content

Source: `resume.json`. Descriptions are trimmed to LinkedIn's 2,000-character
limit. Character counts are noted per entry.

---

## Headline (220 char limit)

```
Full-stack Software Engineer & Architect | LLM Systems, Blockchain | 35 years shipping — Microsoft, Trilogy, DAOstack, Curve Labs
```
*128 characters.* Mirrors `basics.label` and adds the company list, which is
what disambiguates you from the other findable Douglas Kents.

---

## About (2,600 char limit; only ~3 lines show before "see more")

```
I build systems that make language-model output bounded and testable, with a human at the point of judgment.

Most recently: a full-stack qualitative analysis pipeline that reads open-ended survey responses and surfaces patterns for people to interpret. The hard part is that models don't repeat themselves, so I made completeness a property of the orchestration code rather than of any single generation — every input provably resolves to one of four explicit terminal states, matched by arithmetic rather than by the model's own claims. Nothing reaches client-facing output without a person approving it, and that boundary is enforced by package structure rather than by discipline. I made the whole thing testable by capturing real model responses once and replaying them, and calibrated it against a synthetic evaluation set built to measure what the pipeline invented as well as what it missed.

Before that, six years in Web3 — leading dApp frontend teams at Curve Labs and DAOstack, reviewing Solidity, deploying contracts, and building governance interfaces for DAOs including a regenerative economic system for the island nation of Curaçao.

Before that, two decades of enterprise .NET and Java at PSP Investments, GE Healthcare, Revionics, ShiftWise, Trilogy, and Microsoft, where I started on the Windows 3.1 team.

The through-line is architecture under constraint: bounded contracts between components, tests that prove the boundaries hold, and a preference for making guarantees structural rather than procedural.

U.S., Canadian and U.K. citizen. Based in Costa Rica, working U.S. hours.
```
*~1,640 characters.*

---

## Experience entries

LinkedIn wants one entry per role. Enter **newest first**; LinkedIn sorts by
date anyway.

For the six self-directed entries, set **Company = "Independent Software
Developer"** and use **Employment type: Self-employed**. That matches
`resume.json` and reads as continuous independent work rather than six
unrelated employers.

---

### 1. Human Lens

**Title:** Technical Lead & LLM Pipeline Architect — Human Lens
**Company:** Independent Software Developer · Self-employed
**Dates:** May 2026 – Present
**Location:** Remote

```
Modeled on an existing DEI consultancy, turned an open-ended qualitative analysis problem into a full-stack web application wrapping a bounded, testable LLM pipeline: staged contracts between components, empirical calibration to reduce output variance, and a client-safe boundary enforced from the pipeline through to the human-review interface.

• Scoped, designed, and built in TypeScript — an Aurelia 2 web application over a Fastify/Node service — with sole authority over every architectural decision; 129 tests green across backend and frontend

• Guaranteed processing completeness in orchestration code rather than in prompts: every input provably resolves to one of four explicit terminal states, so nothing is silently dropped regardless of model behavior

• Designed a seven-lens analytic architecture running in six ordered waves; three lenses validated against a real model to date, with calibration driven by a purpose-built synthetic evaluation dataset

• Made a non-deterministic system testable: captured real model responses once and replayed them, so runs became reproducible and far cheaper

• Designed test data that measured failure in both directions — what the pipeline missed and what it invented — rather than only rewarding recall

• Built confidentiality controls with a human in the loop: no finding reaches client-facing output without explicit approval, and automated de-identification holds for review anything it misses, with the client-safe boundary enforced by package structure

• Ran a hybrid human/AI development process: delegated implementation to a coding agent, routed design decisions through an independent review model, and adjudicated every conflict personally

Skills: LLM Pipeline Architecture · LLM Evaluation · TypeScript · Human-in-the-Loop Design · Prompt Engineering · Aurelia 2 · Fastify · Node.js
```
*~1,930 characters. Trimmed from the resume version — the "derived
requirements by using an LLM to analyze published materials" highlight was cut
to fit.*

---

### 2. Butterfly — dApp

**Title:** Technical Lead & dApp Architect — Butterfly (dApp)
**Company:** Independent Software Developer · Self-employed
**Dates:** Jun 2025 – Sep 2025

```
Designed and built a cryptocurrency portfolio management dApp that executes scaled take-profit sales across multiple exchanges. Supported by the Butterfly portfolio management service (listed separately).

• Real-time price monitoring and balance tracking, with order history and status
• Batch take-profit orders across multiple exchanges, using percentage-based or fixed-amount strategies
• MVVM single-page application frontend
• Built using GitHub Copilot Chat in VS Code as a coding assistant

Skills: TypeScript · Aurelia 2 · MVVM · DeFi · TailwindCSS · Vite
```
*~570 characters.*

---

### 3. Butterfly — service

**Title:** Technical Lead & dApp Architect — Butterfly (service)
**Company:** Independent Software Developer · Self-employed
**Dates:** Jun 2025 – Sep 2025

```
Designed and built a REST API service supporting secure cryptocurrency exchange operations across multiple exchanges. Supports the Butterfly portfolio management dApp (listed separately).

• Comprehensive safety mechanisms, testing, dependency injection and production-ready integration
• Layered, service-oriented code architecture
• Fastify server providing Swagger/OpenAPI documentation
• Node.js with TypeScript; TSyringe for dependency injection
• Axios for exchange-API communications

Skills: TypeScript · Node.js · Fastify · TSyringe · DeFi
```
*~560 characters. Keeping the dApp and the service as separate entries
demonstrates the full-stack claim concretely — frontend on one, backend on the
other, same project, same three months.*

---

### 4. Curve Labs — contract

**Title:** Blockchain Oracle Developer
**Company:** Curve Labs
**Dates:** Apr 2023 – May 2023
**Employment type:** Contract

```
Invited back on contract. Developed an automated "Oracle" service maintaining the state of Kolektivo regenerative finance (ReFi) smart contracts on the Celo (EVM-compatible) blockchain.

• Worked with the kG, kCur and cUSD tokens and a Balancer WeightedPool ported to Celo by Symmetric
• Used the MentoReserve and Balancer WeightedPool contracts to hold the value of the total kCur supply in MentoReserve equal to the value of the total kG supply
• Used the Balancer WeightedPool to maintain kCur price stability within an acceptable range, in its role backing kG
• Used OpenZeppelin Defender for key management, secret encryption, transaction sending, and service hosting
• Reported cUSD, kCur and kG prices to smart contract oracles

Skills: Solidity · Ethereum · ethers.js · TypeScript · DeFi · ReFi · Celo
```
*~790 characters. "Invited back on contract" leads deliberately — it's a
strong signal and it's cheap.*

---

### 5. Curve Labs

**Title:** Development Team Lead and Lead Developer
**Company:** Curve Labs
**Dates:** Aug 2020 – Nov 2022

```
Led teams of 2–5 building the frontends of multiple dApps on the Ethereum blockchain, focused on decentralized finance (DeFi) and regenerative finance (ReFi). Among others, led the development team for a ReFi dApp designed to emerge a regenerative, decentralized economic system for the sovereign island nation of Curaçao.

• Lead and sole coder of the dApp frontends of Prime Pools, Prime Locking For Reputation, and the original PrimeDAO home page
• Coordinated a team of five and did much of the coding of the Prime Deals dApp frontend
• Coordinated a team of two and did the majority of the coding of the Prime Launch dApp frontend
• Coordinated a team of two on the Kolektivo dApp frontend
• Reviewed Curve Labs Solidity contracts for code quality, bugs and security, proposing accepted improvements and bug fixes
• Integrated Balancer Liquidity Pools, the Gnosis Safe API for governance, and CoinGecko for token prices
• Interviewed applicants for developer and project lead positions
• Built in the Aurelia framework, except the PrimeDAO home page which used React

Skills: TypeScript · Solidity · Ethereum · Web3 · dApps · ethers.js · DeFi · ReFi · Aurelia · React
```
*~1,120 characters. Trimmed: the eleven resume highlights condensed to eight,
URLs removed (LinkedIn doesn't linkify them in descriptions).*

---

### 6. DAOstack

**Title:** Senior Lead Developer
**Company:** DAOstack
**Dates:** Sep 2017 – Oct 2020

```
Performed multiple development roles in the design, creation and use of DAOstack DAOs — one of the first major DAO designs in the history of DAOs. Used, reviewed and deployed Solidity smart contracts, wrote a TypeScript library enabling dApps to access them, wrote a test dApp, and contributed significantly to Alchemy, the dApp used to work with the DAOs.

• One of the primary later developers of Alchemy, the DAOstack website enabling anyone to participate in DAOstack DAOs
• A year and a half coding with React in Alchemy
• Reviewed DAOstack Arc Solidity contracts for code quality, bugs and security, proposing accepted improvements and bug fixes
• Responsible for deploying DAOstack Arc smart contracts to Ethereum
• Implemented and helped design the dxDAO Vote Staking Interface, for initializing reputation in the dxDAO, which governs the DutchX permissionless ERC20 trading protocol
• Designed and implemented a well-reviewed architecture for the original version of DAOstack Arc.js
• Implemented Vanille, open-source software leveraging DAOstack Arc to facilitate the creation of DAOstack DAOs

Skills: TypeScript · Solidity · Ethereum · Web3 · dApps · DAO Governance Systems · React
```
*~1,160 characters.*

---

### 7. Dicom Transportation Group

**Title:** Senior Web Developer
**Company:** Dicom Transportation Group
**Dates:** Feb 2017 – Apr 2017
**Employment type:** Contract

```
Fixed bugs and developed new features for an internal web application used to coordinate trucks, drivers, routes and delivery locations across Québec.

Skills: C# · ASP.NET MVC · Razor · SQL Server · jQuery
```
*~205 characters. Short by design — a two-month contract needs one line.*

---

### 8. Vivalia Bistro Express

**Title:** Sole Web Developer
**Company:** Vivalia Bistro Express
**Dates:** Jun 2016 – Oct 2016

```
Developed a website giving Vivalia and its customers an efficient way to place and handle orders. Designed and created the entire site and database single-handedly, with a performant and intuitive user interface and well-structured, modular code.

Skills: TypeScript · Aurelia · C# · ASP.NET Core · SQL Server · Azure
```
*~305 characters.*

---

### 9. GE Healthcare

**Title:** Senior Lead Web Developer
**Company:** GE Healthcare
**Dates:** Mar 2015 – Feb 2016

```
Developed automated machine-to-machine communication enabling two companies to substantially increase the efficiency of their relationship.

• Designed the system end-to-end; wrote everything myself except the AngularJS front end
• Created a dynamic, data-driven schema for the exchanged content
• Integrated an AngularJS web application, two external web services, a .NET web server, an Azure web job, and a SQL Server database
• Hosted on Azure

Skills: C# · ASP.NET Web API · AngularJS · SQL Server · Azure · Entity Framework
```
*~525 characters.*

---

### 10. PSP Investments

**Title:** Sole Senior Lead Web Developer
**Company:** PSP Investments
**Dates:** May 2014 – Dec 2015

```
As a member of the business intelligence analytics group, single-handedly developed web applications for other departments within PSP.

• Many colleagues commented that these were the most performant and usable websites ever developed internally at PSP
• Built an application letting users search unstructured documents through a Google-like interface using semantic search
• Built a reporting site presenting data in charts, graphs and tables for PSP's executive portfolio rebalancing committee
• Researched knowledge base, graph and RDF database technologies — AllegroGraph, Semaphore, Neo4j — to plot directions for expanding PSP's knowledge-based search

Skills: C# · JavaScript · D3.js · Highcharts · ASP.NET Web API · Knockout.js · SQL Server
```
*~745 characters.*

---

### 11. Revionics

**Title:** Senior Web Developer
**Company:** Revionics
**Dates:** Nov 2011 – Mar 2013

```
Led an offshore development team in an Agile Scrum environment, architecting and developing portions of a complex enterprise-scale, customer-facing web application.

• In daily scrums, coordinated and helped train a team of seven developers in India — on Agile, on development process, and on Revionics code quality standards
• Led a team of three in India architecting and developing a web GUI for managing security rights; responsible for the architecture, the quality of the result, team coordination, and timely delivery, while writing half the code myself
• Saved the security rights project, which was in jeopardy of missing its deadline, by reducing the assisting team from seven developers to three
• Helped port a complex web GUI from ASP.NET to MVC.NET 3.0, designing the server-side architecture and writing most of the server-side code
• Developed an unobtrusive framework for logging application activity using dependency injection and API interception with Unity, plus a plugin architecture using MEF
• Designed and prototyped a reusable framework for SpecFlow integration tests using Unity, Moq and VSTest, driven against Selenium for automated GUI testing

Skills: C# · ASP.NET MVC · JavaScript · Knockout.js · Unity · Agile Methodologies
```
*~1,235 characters.*

---

### 12. ShiftWise

**Title:** Senior Lead Web Developer, Manager Partner Integrations
**Company:** ShiftWise
**Dates:** Aug 2003 – Jul 2011

```
Performed a lead role in an Agile Scrum environment coding a complex enterprise-scale, customer-facing web application and its automated web service interface.

• Meeting an urgent deadline, virtually single-handedly implemented a system for handling mission-critical incoming and outgoing SMS messages; the architecture spanned a website, three web services, two Windows services, and two SQL Server databases
• Lead Developer on the ShiftWise Vendor Management System, a large and complex web application used by hospital administrators and medical staffing agencies to improve the hiring and placement of temporary medical staff
• Manager and Lead Developer of ShiftWise Partner Integrations, a set of web services and Windows applications enabling automated integration between the ShiftWise VMS and customers' back-office systems
• Senior Developer of ShiftWise TextConnect, enabling nurses to interact with the VMS by SMS
• As Interim Development Team Manager and the most experienced .NET developer on the team, coordinated and set priorities, helped raise developer skills, and improved the quality of the software engineering process
• Worked directly with ShiftWise clients to plan and coordinate their side of automated interface development

Skills: C# · ASP.NET · JavaScript · SQL Server · WCF · Agile Methodologies
```
*~1,290 characters. Eight years, and the longest tenure on your profile —
worth the full treatment.*

---

## Pre-2003: compress

Everything before ShiftWise should be condensed. LinkedIn readers don't scroll
that far, and separate entries for two-month contracts make the timeline look
choppy.

**Recommended:**

### Trilogy
**Title:** Software Engineer
**Company:** Trilogy
**Dates:** Mar 1999 – Mar 2001

```
Delivered software for three enterprise clients as a Trilogy consultant.

• Ford Motor Company: designed, wrote and delivered ahead of schedule the framework that served content to every page of Ford.com, the company's flagship website. The code was virtually flawless on first release.
• carOrder.com: repaired the Needs Analysis and Car Comparison features, front end and back end, reducing customer complaints about bad data to zero; wrote a Developer's Reference that substantially reduced ramp-up time for new developers
• IBM: sole developer and support for an application critical to an international IBM workflow; solved a critical issue that had vexed prior developers and helped save that part of the contract for Trilogy

Skills: Java · JSP · XML · JavaScript
```
*Merges the three separate Trilogy entries. ~700 characters.*

### Microsoft
**Title:** Software Engineer / Development Manager
**Company:** Microsoft
**Dates:** Jan 1991 – Jun 1996

```
Four engagements across Windows and the multimedia titles group.

• On the Windows 3.1 team, developed File Manager, Packager, Paintbrush and Cardfile
• Incorporated OLE 1.0 into Windows Write — a highly visible, strategic initiative at the highest levels of Microsoft
• Wrote the core GUI engine for the Julia Child "Home Cooking With Master Chefs" multimedia CD-ROM title
• Managed a multi-disciplinary team of seven engineers plus writers and graphic designers to deliver the Reader's Digest Complete Do-It-Yourself Guide CD-ROM on time and meeting all quality goals
• Wrote the subsystem enabling localization of Encarta '97 into five languages

Skills: C++ · Windows
```
*Merges the four separate Microsoft entries into one date range. ~660
characters. The Windows 3.1 line is a genuine conversation starter.*

### Others worth one line each
- **Asymetrix Corporation** — Software Engineer, Apr 1992 – Oct 1994
- **ConnectSoft** — VP Applications Development, Oct 1989 – Dec 1990
- **University of North Carolina** — Software Engineer, May 1985 – Dec 1989

**Cut entirely:** Biomonitors (1 month), Texas Turnpike Authority (2 months),
Schlumberger (3 months), Imagen, Dupont Design Technologies, SAS Institute,
Pacific Environmental Services, Mouthing Flowers, Kill My TV!, Password
Repository. Ten entries that add nothing and make the timeline look erratic.

---

## Skills section (100 slot cap; use 25–30)

Top three are pinned to your profile — choose deliberately:

1. **LLM Pipeline Architecture**
2. **LLM Evaluation**
3. **TypeScript**

Then, in order:

Human-in-the-Loop Design · Prompt Engineering · Solidity · Ethereum ·
AI-Assisted Development · Web3 · De-identification · dApps · ethers.js ·
Aurelia 2 · DAOs · DAO Governance Systems · DeFi · Web Components · Wallets ·
MVVM · ReFi · SPA · IPFS · Claude Code for VS Code · Subgraph · Liquidity
Bootstrapping Pools · Node.js · Fastify · C#

**Important:** after entering these, go back into each Experience entry and
attach the relevant subset there. That per-role association is what LinkedIn
Recruiter actually searches against, and most people skip it.

Type each skill and take LinkedIn's autocomplete suggestion where one exists —
standardized skills index better than free text. Some of yours (LLM Pipeline
Architecture, Human-in-the-Loop Design) may not be in their taxonomy; use the
nearest match if so.

---

## Settings checklist

- [ ] **Settings → Visibility → Share profile updates with your network: OFF**
      before you start editing
- [ ] **Open to Work** — recruiter-visible at minimum; highest-return single
      toggle for inbound
- [ ] **Custom URL** — `/in/douglaskent` is taken; pick something like
      `douglaskent-dev` and use it consistently
- [ ] **Featured section** — link `douglaskent.com/resume/expanded`, and the
      Prime Deals / Prime Launch dApps if still live
- [ ] **Location** — consider setting a U.S. metro if targeting U.S. remote
      roles; the About section carries the honest version
- [ ] Turn profile updates back ON when finished
