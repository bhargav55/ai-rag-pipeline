# How the Ragas Framework Works

Ragas is an evaluation framework for RAG systems.

In simple terms, your RAG app does this:

```txt
question -> retrieve docs/chunks -> generate answer
```

Ragas checks whether that pipeline worked well.

It evaluates both sides of the RAG system:

1. The retriever: did we fetch the right context?
2. The generator: did the model produce a grounded, useful answer?

## The core idea

A normal RAG pipeline has three important artifacts for every question:

```txt
user question
retrieved context chunks
generated answer
```

If you also have a known-good answer, you can add:

```txt
reference answer
```

Ragas uses these fields to score the quality of the RAG output.

For this repo, the exported Ragas dataset rows look like this:

```json
{
  "user_input": "What happens when margin falls below maintenance?",
  "response": "When account equity falls below the maintenance margin requirement, the position becomes eligible for liquidation.",
  "retrieved_contexts": [
    "Margin requirements define the minimum equity an account must maintain...",
    "Liquidation occurs when an account cannot satisfy maintenance margin..."
  ],
  "reference": "If margin falls below maintenance, the account can be liquidated to protect the protocol from bad debt."
}
```

## What Ragas measures

### 1. Context precision

Context precision asks:

```txt
Of the chunks we retrieved, how many were actually useful?
```

Example:

Question:

```txt
What did the docs say about funding payments?
```

Retrieved chunks:

```txt
1. funding rate mechanics
2. premium index calculation
3. unrelated liquidation penalty text
```

The first two chunks are useful. The third one is noise.

High context precision means the retriever is not polluting the prompt with irrelevant chunks.

Low context precision means the retriever is returning junk, which can confuse the LLM or waste context window.

### 2. Context recall

Context recall asks:

```txt
Did we retrieve enough of the important information needed to answer the question?
```

Example:

Question:

```txt
What happens when margin falls below maintenance?
```

A good retrieval result should include chunks about:

- maintenance margin
- liquidation eligibility
- account equity
- risk controls / bad debt protection

If the retriever only returns a generic margin definition but misses liquidation, context recall will be low.

High context recall means the retrieved context contains the key facts needed for a complete answer.

Low context recall means the retriever missed important evidence.

### 3. Faithfulness

Faithfulness asks:

```txt
Is the answer supported by the retrieved context?
```

This is the hallucination check.

Example:

Retrieved context says:

```txt
The account becomes eligible for liquidation.
```

Bad answer says:

```txt
The account is immediately liquidated and charged a 20% penalty.
```

If the retrieved context never said "immediately" or "20% penalty", Ragas can flag the answer as unfaithful.

High faithfulness means the answer is grounded in the retrieved chunks.

Low faithfulness means the answer added unsupported claims.

### 4. Answer relevancy

Answer relevancy asks:

```txt
Did the answer actually answer the user’s question?
```

Example:

Question:

```txt
What are the risks of oracle manipulation?
```

Bad answer:

```txt
Oracles are used by DeFi protocols to fetch prices.
```

That answer may be true, but it does not directly answer the risk question.

High answer relevancy means the response is focused and useful.

Low answer relevancy means the answer is generic, evasive, incomplete, or off-topic.

## How Ragas scores these metrics

Ragas often uses an LLM as a judge.

Instead of only doing string matching, it asks a judge model questions like:

```txt
Is this answer supported by the retrieved context?
Are these retrieved chunks relevant to the user question?
Does the answer directly address the user question?
Is any important reference information missing?
```

That is why Ragas needs access to a judge model.

In this repo, the production answer model remains `gpt-5.5`. The repo exports Ragas-compatible JSONL rows that can be consumed by an external evaluation workflow.

## How Ragas fits into this repo

This repo has two eval layers.

### Layer 1: deterministic evals

Run:

```bash
bun run eval evals/questions.json 3
```

These checks are fast and stable.

They verify:

1. Did retrieval return the expected source docs?
2. Did the generated answer include required domain terms?

This is good for CI and smoke tests.

But deterministic evals are limited. They can miss semantic problems.

For example, an answer can mention the right keywords but still be incomplete or hallucinated.

### Layer 2: Ragas-compatible export

Run:

```bash
bun run eval:export evals/questions.json evals/ragas-dataset.jsonl 3
```

This command runs the real RAG pipeline and exports JSONL rows containing:

- `user_input`
- `response`
- `retrieved_contexts`
- `reference`

External RAG evaluation tools can use those rows to score:

- `faithfulness`
- `answer_relevancy`
- `llm_context_precision_without_reference`
- `context_recall`

## Why both eval layers matter

Use deterministic evals for:

- quick regression checks
- CI
- catching obvious retrieval failures
- stable pass/fail gates

Use Ragas evals for:

- semantic quality checks
- hallucination detection
- retrieval quality analysis
- answer completeness checks
- improving prompts, chunking, and retrieval settings

The practical setup is:

```txt
deterministic evals = fast guardrails
Ragas evals        = deeper semantic quality measurement
```

## How to interpret Ragas results

If faithfulness is low:

- the answer is making claims not present in retrieved context
- tighten the prompt
- tell the model to only answer from context
- improve citation requirements

If answer relevancy is low:

- the model is not directly answering the question
- improve the system prompt
- make eval questions more specific
- inspect whether retrieved context is distracting the model

If context precision is low:

- retrieval is returning irrelevant chunks
- improve embeddings
- reduce `topK`
- improve chunking
- add metadata filters

If context recall is low:

- retrieval is missing important chunks
- increase `topK`
- improve chunking
- add section-aware markdown chunking
- improve the document corpus

## Why this is useful for a portfolio artifact

Ragas shows that the RAG pipeline is not just a demo that returns answers.

It shows the system has an evaluation loop.

That matters because production RAG quality depends on continuous measurement:

```txt
change chunking -> run evals -> compare scores
change prompt   -> run evals -> compare scores
change topK     -> run evals -> compare scores
change model    -> run evals -> compare scores
```

This makes the repo look more production-real because it demonstrates:

- retrieval evaluation
- answer grounding evaluation
- hallucination checks
- reference-based quality checks
- repeatable benchmark data

## One-sentence summary

Ragas is a testing framework that grades the retriever and generator parts of a RAG pipeline using LLM-based semantic judgments instead of only keyword checks.
