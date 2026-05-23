# Portfolio Chatbot Scope

## Purpose

The portfolio chatbot answers questions about Bhargav Kacharla's profile, protocol engineering work, AI engineering projects, RAG pipeline, agent systems, security work, and contact details.

It should answer from indexed portfolio documents and cite retrieved sources. If the indexed documents do not contain enough information, the chatbot should say what context is missing instead of inventing details.

## Knowledge Sources

The first corpus includes clean Markdown documents derived from the portfolio website and resume PDF content.

Future corpus sources can include the live website HTML, project README files, developer documentation, whitepapers, audit reports, research notes, and support documentation.

## Multi-Tenant Design

The same RAG pipeline can support multiple websites or customers by tagging every document and vector chunk with tenant and site metadata.

For the personal portfolio corpus, use tenantId `personal` and siteId `bhargav-portfolio`.

For customer deployments, use a customer-specific tenantId and one or more siteIds such as `marketing-site`, `developer-docs`, `whitepaper`, or `support-center`.

At query time, the retriever must filter by tenantId and siteId so a chatbot only searches the documents it is allowed to use.
