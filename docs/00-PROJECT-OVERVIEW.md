# Project Overview

## Project identity

**Name:** OpsPilot — AI Business Operations Platform  
**Product type:** Full-stack business operations SaaS platform  
**Current lifecycle state:** Documentation complete; Phase 1 implementation not started

## Purpose

OpsPilot is intended to provide one platform for customer commerce and support activities and for business owners to manage day-to-day operations. Later phases add AI assistants that can answer questions from approved company documents and, where authorization allows, account, order, and business data.

## Problem being solved

Business commerce, inventory, orders, customer support, internal operations, reporting, and knowledge are often fragmented across tools. OpsPilot aims to provide a coherent application boundary for these workflows and introduce AI only after the underlying data, security, and operational foundations are stable.

No specific industry, company size, geography, legal regime, or business model has been selected. **Decision Required.**

## Target users

### Customers

Customers can eventually:

- Register and log in.
- Browse, search, filter, sort, and inspect products.
- Add products to a cart.
- Place and pay for orders.
- Track orders.
- Raise support tickets.
- Chat with a customer AI assistant.
- Ask questions about company policies and documents.
- Receive answers using their own account or order information where appropriate and authorized.

### Business owner and administrators

Owners and administrators can eventually:

- View a business dashboard.
- Manage products, categories, inventory, orders, customers, employees, roles, and permissions.
- Manage support tickets.
- View reports and analytics.
- Upload company documents.
- Use an owner AI assistant for business questions and generated insights.
- Receive real-time notifications.

The exact distinction between the owner and administrator roles is a **Decision Required**.

### Future employees and managers

Employee and manager roles may be introduced with granular role-based access control (RBAC). Their workflows and default permissions are a **Decision Required** and must not be assumed during early implementation.

## Functional modules

| Module | Core responsibility | Planned phase |
|---|---|---:|
| Platform foundation | Repository, frontend, API, database tooling, configuration, health checks | 1 |
| Identity and access | Registration, login, users, roles, permissions, protected access | 2 |
| Catalog and operations | Products, categories, inventory, customers/employees as authorized | 3 |
| Commerce | Cart, order placement/tracking, payments | 4 |
| Production backend | Hardening, support workflows, reporting foundations, audit concerns | 5 |
| Asynchronous operations | Real-time notifications, queues, background jobs, supporting cache if justified | 6 |
| AI service foundation | Python/FastAPI boundary and initial assistants | 7 |
| Document intelligence | Upload pipeline, vector storage, retrieval-augmented generation | 8 |
| Agentic AI workflows | LangGraph business analysis and AI-assisted support workflows | 9 |
| Production readiness | Full testing, Docker, CI/CD, deployment preparation | 10 |

Module-to-phase boundaries may be refined during phase review, but moving a future capability earlier requires an explicit decision.

## AI capabilities

The eventual platform is expected to include:

1. A customer AI assistant.
2. A business owner AI assistant.
3. RAG over approved company documents.
4. Permission-aware business-data queries and analysis.
5. LangChain-based AI integration.
6. LangGraph workflows for multi-step business and support tasks.
7. A separate Python/FastAPI AI service.
8. AI-powered support workflows with controlled tools and human oversight where required.

AI is not part of Phase 1 and is not authorized for implementation during documentation.

## Technology direction

| Layer | Direction | Status |
|---|---|---|
| Web client | React with JavaScript and React Router | Agreed |
| Client state | Redux Toolkit only where shared complexity justifies it | Conditional |
| UI system | Material UI or Tailwind CSS | **Decision Required** |
| Main API | Node.js, Express, JavaScript | Agreed |
| Relational data | MySQL with Prisma | Agreed |
| AI service | Python, FastAPI, LangChain, LangGraph | Future, agreed direction |
| Retrieval | RAG plus a vector database | Vector technology **Decision Required** |
| Supporting infrastructure | Redis, queues, Socket.IO/WebSockets, object storage | Future, introduce only when justified |
| Delivery | Docker, GitHub Actions, AWS | Future; detailed choices **Decision Required** |

The main frontend and backend must remain JavaScript. TypeScript migration is out of scope unless the project direction is explicitly changed.

## Development phases

1. Foundation.
2. Authentication and RBAC.
3. Business Core.
4. Orders and Payments.
5. Production Backend Features.
6. Real-time and Background Jobs.
7. AI Foundation.
8. RAG and Document Intelligence.
9. LangGraph Business AI and AI Support.
10. Testing, Docker, CI/CD, and Production.

Each phase must define requirements, goals, tasks, acceptance criteria, tests, edge cases, security considerations, completion criteria, and documentation updates. A phase must be reviewed before implementation and accepted before the next phase begins.

## Overall system flow

### Core application flow

1. A user interacts with the React web client.
2. The client calls versioned Node.js/Express APIs.
3. Middleware authenticates, authorizes, validates, and adds request context where applicable.
4. Controllers delegate to business services.
5. Services enforce business rules and transactions and use the data-access boundary.
6. Prisma reads or writes relational data in MySQL.
7. The API returns a consistent success or error response to the client.

### Future AI flow

1. The React client sends an authorized AI request to the Node.js API.
2. Node.js establishes trusted user, tenant/business, role, and resource scope.
3. Node.js invokes the Python/FastAPI AI service over an authenticated internal boundary.
4. LangChain or LangGraph coordinates only approved retrieval or business tools.
5. Results are filtered, audited as appropriate, and returned through Node.js.

Multi-tenancy, tenant isolation strategy, and whether the initial release supports one or multiple businesses are a **Decision Required**.

## Success boundaries

This document defines product direction, not detailed behavior. Where a requirement has not been discussed, documents use **Decision Required** rather than inventing a rule.

