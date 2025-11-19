up:: [[Atlas - Initial Node]]


# Package.json
This is the *Project manifest* for *Node/JavaScript* projects
It tells tools like **npm, pnpm,** or **yarn**
1. What my project is called
2. How to run it (*scripts*)
3. Which libraries depends on

"*Here is what the project is, and here are the dev tools needed to* **build + deploy**"
![[package.json]]

*Content*:
```
{
"name": "cf_ai_orbii", //Project's name
"version": "0.1.0", //Project's version
"private": true, //Whether the project is private
"scripts": {
"dev": "wrangler dev", //Dev command
"deploy": "wrangler deploy", //Deploy command
"typecheck": "tsc --noEmit" //Typecheck command
},
"devDependencies": {
"@cloudflare/workers-types": "^4.20241004.0", //Cloudflare workers types
"typescript": "^5.6.3", //Typescript
"wrangler": "^3.80.0" //Wrangler

}

}
```