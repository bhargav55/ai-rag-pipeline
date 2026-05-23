# AI Engineering Work

## Protocol Knowledge Assistant

Bhargav built a TypeScript and Bun RAG pipeline for blockchain protocol documentation with document ingestion, section-aware chunking, Qdrant vector search, and citation-grounded LLM answers.

The pipeline supports incremental indexing with content hashes, chunk hashes, stale vector deletion, and a Postgres document registry to skip unchanged documents and avoid unnecessary re-embedding.

It includes retrieval and answer-quality evaluations, judge scoring for faithfulness, relevance, citation correctness, structured JSON validation, missing-context handling, and per-stage trace timings.

The system is designed as a reusable RAG backend for website and documentation chatbots, where each customer or website can be isolated by tenant and site metadata.

## Agent Orchestrator

Bhargav designed a workflow orchestration engine for LLM-based agents executing DeFi protocol actions such as liquidations, TP/SL, and monitoring over on-chain data.

The orchestrator implements routing, multi-step execution, retries, and observability through traces and logs to make tool-using agents reliable across multiple calls.

## RAG-Based Knowledge Assistant

Bhargav built a retrieval-augmented generation system with ingestion, chunking, embeddings, and semantic search.

The system uses structured outputs and evaluation frameworks to improve answer accuracy and reduce hallucination.

Repository: https://github.com/bhargav55/ai-rag-pipeline

## AI Smart-Contract Auditor

Bhargav built an AI-assisted smart contract auditor that combines LLM reasoning with Slither static analysis and a knowledge base of historical EVM exploits.

The auditor reviews Solidity contracts, retrieves similar exploit patterns, highlights risky code paths, and reports findings with supporting context.

The project focuses on making smart contract review faster and more systematic, while keeping static analysis, exploit retrieval, and LLM reasoning in one workflow.
