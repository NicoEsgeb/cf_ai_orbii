up:: [[Atlas - Initial Node]]

# What is the *Worker*
![[worker.ts]]
This file contains the *main entry point to Cloudflare*
Whenever the user makes a *request* to my *Worker URL*, this code runs


```
// src/worker.ts

/*------------------- Explanation notes ----------------------
This is the main entry point for the Cloudflare Worker. 
Whenever someone makes a REQUEST to the WORKER, this code runs
------------------------------------------------------------*/

//---------------------- Main entry point function -------------------------
export default {
  async fetch(request: Request): Promise%3CResponse%3E {
    // This is the response that will be sent when the worker is fetched.
    return new Response("Hello from cf_ai_orbii Study Buddy Worker!", {
      // This is the headers that will be sent when the worker is fetched.
      headers: {
        // This is the content type of the response.
        "content-type": "text/plain; charset=utf-8",
      },
    });
  },
};
//--------------------------------------------------------------------------->)
```