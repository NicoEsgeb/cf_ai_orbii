up:: [[Atlas - Initial Node]]
up:: [[TypeScript]]

---
# What is *Cloudflare Worker*?
*Orbi's Brain*

A small piece of code (*JavaScript/TypeScript*) that runs on *Cloudflare's servers* instead of your own computer. Is a small program I wrtie that runs on *Cloudflare’s global network* instead of your own server, and acts as your app’s backend.

##### Concept idea of how it works
1. User goes to *-http://orbii.com-*
2. **Cloudflare** says: "Hey! I have a **Worker** here"
3. The **Worker** runs some code like:
	1. Read the request
	2. Talk to an API
	3. Send back a response

##### Difference between *Cloudflare Worker* and *Normal Backend*
1. *Normal Backend*:
	1. I rent a server in *AWS*
	2. I install Node, Python, etc
	3. I keep that running, update it and worry about scalling
2. **Cloudflare Worker**:
	1. I *only write a function*
	2. I run **wrangler deploy**
	3. **Cloudflare**:
		1. Runs the function on many servers around the world
		2. Scales automatically
		3. handles the "ops" bits

So... it's *serverless* -> I don't see or manage the server

---

# What will this *Worker* do for **Orbii**
1. ***Backend brain of Orbii***
	1. Receives requests from my UI (desktop/web)
	2. Accept PDF/text from the user
	3. Maybe store or process it
	4. Call AI models / tools
	5. Send answers back to the front end

---

