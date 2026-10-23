# When to Use a Skill: Scenarios, Case Studies and Examples

*A plain-language guide to choosing a Skill over Claude's other features.*

---

## 1. What is a Skill?

A **Skill** is a saved set of instructions that teaches Claude how to do a particular task your way. Think of it as a **recipe card** in a kitchen drawer:

- The drawer holds many recipe cards, but you only see each card's **title and a one-line summary** until you need it.
- When a task matches a card, Claude **pulls that card out and follows it**.
- A card can have **extra pages clipped to it** (reference material, templates, or small tools) that Claude reads only if the task calls for them.

That last point matters. Because Claude only glances at the summary until a Skill is needed, you can keep many Skills on hand without cluttering every conversation. Anthropic calls this *progressive disclosure*: a short summary first, the full instructions when needed, and the extra pages only as required.

> **In one sentence:** a Skill is how you teach Claude a repeatable task once, so you never have to explain it again.

---

## 2. The toolbox at a glance

Skills are one of several features. Each one is good at a different job.

| Feature | What it is, in plain terms | Best for |
|---|---|---|
| **Prompt** | What you type in a conversation. | One-off requests. It is forgotten when the conversation ends. |
| **Project** (Claude apps) | A workspace with its own chats, uploaded documents and instructions. | Background knowledge for one piece of work, always on hand inside that project. |
| **Skill** | A saved "how-to" Claude picks up when a task matches. | A repeatable task, done the same way, anywhere you need it. |
| **Connector (MCP)** | A link from Claude to your other tools and data (files, calendars, databases). | Letting Claude reach information that lives elsewhere. |
| **Subagent** (Claude Code) | A separate helper with its own workspace and its own permissions. | Handing off an independent piece of work so it doesn't crowd the main conversation. |
| **Hook** (Claude Code) | An automatic rule that runs every time a certain event happens. | Rules that must *never* be skipped. |

Anthropic sums up two of the most common comparisons this way:

- **Projects vs. Skills:** "Projects say 'here's what you need to know.' Skills say 'here's how to do things.'"
- **Connectors (MCP) vs. Skills:** "MCP connects Claude to data; Skills teach Claude what to do with that data."

---

## 3. Quick decision guide

Ask yourself these questions, in order:

1. **Will I only ask for this once?** Just use a **prompt**.
2. **Have I typed the same instructions more than once?** Make it a **Skill**.
3. **Am I copying the same instructions into several Projects?** Make it a **Skill**, so one copy serves them all.
4. **Does Claude need information that lives in another tool?** Add a **connector**, and use a **Skill** to say what to do with that information.
5. **Must a rule hold every single time, with no exceptions?** Use a **hook** (in Claude Code). A Skill guides Claude; a hook enforces.
6. **Is this a big, separate job I want handled on its own?** Use a **subagent**, which can itself use your Skills.

---

## 4. Scenarios where a Skill is the better choice

Each scenario below shows the situation, why a Skill fits, and what goes wrong with the alternative.

### Scenario 1: You keep retyping the same instructions

**Situation:** Every Friday you ask Claude for a weekly status update and explain the same format each time: three headings, a short summary at the top, risks in red, no more than one page.

**Why a Skill wins:** Prompts don't carry over between conversations. Anthropic's guidance is direct: once you find yourself typing the same prompt across conversations, "it's time to create a Skill." Write the format down once, and asking for "this week's status update" is enough.

**The alternative falls short because:** retyping takes time, and small differences in wording each week produce reports that don't quite match.

---

### Scenario 2: The same rules apply across many pieces of work

**Situation:** Your organisation has brand guidelines (tone of voice, approved phrases, how to write the company name) that apply to every document, whatever the project.

**Why a Skill wins:** A Project's instructions only apply inside that one Project. If you paste the same rules into five Projects, you now have five copies to keep up to date. Anthropic calls copying instructions across Projects "a signal to create a skill instead." A brand-guidelines Skill is one copy, used wherever it's relevant.

**The alternative falls short because:** when the guidelines change, it's easy to update four copies and forget the fifth.

---

### Scenario 3: Claude can reach your data, but doesn't know your process

**Situation:** You've connected Claude to your company's shared drive. It can now *find* last quarter's sales files, but it doesn't know how your team turns them into a monthly review.

**Why a Skill wins:** The connector provides access; the Skill provides the method. A "monthly sales review" Skill can say which figures matter, how to compare them with last month, and how the finished review should look. Anthropic recommends using both together: connectors for access, Skills for know-how.

**The alternative falls short because:** with a connector alone, Claude has the data but improvises the method, so each month's review comes out a little different.

---

### Scenario 4: Lots of reference material that's only sometimes needed

**Situation:** Your team has a long expenses policy covering travel, meals, equipment and overseas trips. Most questions only touch one section.

**Why a Skill wins:** A Skill can keep each section as a separate attached page and point Claude to the right one ("for travel questions, read the travel page"). The rest stays unread until it's needed. A Project, by contrast, keeps its reference material permanently on hand in that workspace.

**The alternative falls short because:** loading everything for every question is like reading the whole handbook to answer one question about taxi receipts.

---

### Scenario 5: A step that must be done exactly the same way every time

**Situation:** Before a spreadsheet is shared, it must pass the same checks: no blank required columns, dates in the right format, totals that add up.

**Why a Skill wins:** A Skill can include a small **ready-made tool** (a script) that runs those checks the same way every time. Claude runs the tool and reads the result, rather than re-inventing the checks on each request. Anthropic notes that ready-made scripts are more reliable than code written on the spot, and that only the tool's result takes up space in the conversation.

**The alternative falls short because:** asking Claude to "check the spreadsheet" from scratch may produce slightly different checks each time.

---

### Scenario 6: A whole team should do a task the same way

**Situation:** Three people on your team write customer follow-up emails, and each asks Claude in their own words. The results vary in tone and structure.

**Why a Skill wins:** A Skill can be shared. In Claude Code, for example, Skills saved inside a project folder can be committed with that project so the whole team uses them. Everyone gets the same approach, and an improvement made once reaches everyone.

**The alternative falls short because:** individual prompts drift, and good wording discovered by one person stays with that person.

---

### Scenario 7: A helper that needs expertise

**Situation:** In Claude Code, you hand a large data-analysis job to a subagent so it doesn't fill up your main conversation.

**Why a Skill wins:** Subagents and Skills work together rather than competing. Anthropic's example is a Python-developer subagent using a data-analysis Skill. The subagent provides the separate workspace; the Skill provides the know-how. Anthropic describes Skills as "portable and reusable, while subagents are purpose-built for specific workflows."

**The alternative falls short because:** writing all the expertise into the subagent ties that knowledge to one helper, when a Skill could serve any of them.

---

## 5. Case studies

*These are **illustrative** case studies: realistic situations written to show how Skills help. They are not reports about real organisations.*

### Case study A: A small marketing agency keeps its client voices consistent

**Before:** The agency writes social posts for four clients, each with its own tone. Staff pasted a "voice notes" paragraph into each request, and the notes were often out of date.

**What changed:** They created one Skill per client voice. Each Skill describes the tone, words to use and avoid, and two sample posts. Each one says when it applies, for example: *"Use when writing posts for Client A."*

**After:** Staff just ask for "three posts for Client A about the spring sale." Claude recognises the request and follows that client's Skill. When a client updates its style, the agency edits one Skill instead of hunting down old notes.

**Why a Skill, not a Project?** The same voice rules were needed across many separate campaigns. Skills are "how to do things"; the agency's need was a method, not a library of documents.

---

### Case study B: A finance team makes month-end close predictable

**Before:** Month-end close involved a fifteen-step checklist kept in a shared document. Steps were sometimes missed, and new staff needed weeks to learn the order.

**What changed:** The checklist became a Skill with numbered steps and a clear "stop and confirm" point before anything is finalised. A small attached tool checks that the ledger totals balance.

**After:** Anyone on the team can ask Claude to "start the month-end close." Claude works through the steps in order, runs the balance check, and pauses for a person to approve before the final step.

**Why a Skill?** The task is repeatable, the order matters, and one step benefits from a tool that gives the same answer every time.

**One caution the team kept in mind:** if a rule must hold *without exception* (for example, "never finalise without approval"), a Skill helps but cannot guarantee it. In Claude Code, that kind of rule belongs in a **hook**, which runs every time whether or not Claude is following the Skill.

---

### Case study C: A training coordinator answers policy questions faster

**Before:** Employees emailed the coordinator the same questions about leave, travel and equipment. Answering meant searching a 60-page handbook.

**What changed:** The handbook was split into topic pages attached to a "policy questions" Skill. The Skill tells Claude which page to read for which kind of question, and to quote the policy wording rather than paraphrase it.

**After:** Answers draw on the right section, quote the actual policy, and the pages that aren't needed are never opened.

**Why a Skill?** The material is large, but each question needs only a small part of it, which is exactly where loading only what's needed pays off.

---

## 6. When a Skill is *not* the best choice

Skills are powerful, but they aren't the answer to everything.

| If you need... | Use this instead | Why |
|---|---|---|
| A one-time answer | A **prompt** | Creating a Skill isn't worth it for something you'll never repeat. |
| Background documents for one piece of work | A **Project** | Projects keep that knowledge on hand for every chat in the workspace. |
| Access to another tool's data | A **connector (MCP)** | A Skill can't reach data on its own; pair the two if you also need a method. |
| A rule that must never be broken | A **hook** (Claude Code) | Hooks run every time their event happens; Skills are guidance Claude follows. |
| A big, separate job handled on its own | A **subagent** (Claude Code) | Subagents have their own workspace and permissions; they can still use Skills. |
| Something risky, like sending messages or deploying | A Skill that only runs **when you ask for it** | In Claude Code, a Skill can be set so Claude never starts it on its own. |

---

## 7. The advantages of Skills, summarised

- **Write once, reuse everywhere.** No more retyping or copying instructions.
- **Consistent results.** The same task follows the same steps every time.
- **Light on attention.** Claude reads only a short summary until a Skill is needed, and attached material only if it's relevant.
- **Reliable tools built in.** Exact, repeatable steps can be handled by a ready-made tool instead of improvised.
- **Easy to share and improve.** One update reaches everyone who uses the Skill.
- **Works with everything else.** Skills pair with connectors for data, with subagents for separate work, and with Projects for background knowledge.

---

## 8. A few words, explained

- **Prompt:** the message you type to Claude.
- **Skill:** a saved how-to that Claude follows when a task matches it.
- **Description:** the one-line summary on a Skill. Claude reads it to decide whether the Skill fits the task, so it should say both *what* the Skill does and *when* to use it.
- **Project:** a workspace in the Claude apps with its own documents and instructions.
- **Connector (MCP):** a link that lets Claude reach your other tools and data. MCP stands for Model Context Protocol.
- **Subagent:** a separate helper in Claude Code that handles a piece of work in its own workspace.
- **Hook:** an automatic rule in Claude Code that runs every time a set event happens.
- **Script:** a small ready-made tool a Skill can include, which runs the same way every time.

---

*Sources: Anthropic, "Skills explained" (claude.com/blog/skills-explained); Anthropic, "Skill authoring best practices" (platform.claude.com/docs); Claude Code documentation, "Skills" (code.claude.com/docs/en/skills). Information checked 2026-10-22.*
