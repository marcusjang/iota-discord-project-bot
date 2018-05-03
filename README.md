# IOTA Community Projects Bot for IOTA Discord

A simple bot to manage IOTA community projects

## Initial configurations

* Enter your Discord token into the `config.json` file
* Install dependencies using your favourite node package manager
* You are good to go just with `node index`!

## Workflow

1. The project owner adds a project to the bot's approval queue, using `!project add`
1. Moderators approve the project, making it visible and ready for applications
1. When people apply for the project the project owner is notified on whether they will accept or decline
1. Upon acceptance the applicant is sent an URL for the project, hopefully a Discord invite

## Commands

* `!project [help (optional]`
  * List all available commands
  * `help` yeilds the same result
* `!project list [mine|pending (optional)]`
  * List currently active projects
  * List all projects (Moderator only)
  * `mine` List my projects
  * `pending` List pending projects (Moderator only)
* `!project about <NAME>`
  * Show specifics about the project
* `!project add <NAME> <DESCRIPTION> <INVITE_URL>`
  * Add a new project to the approval queue
  * A Discord server invite link is preferred for the <INVITE_URL>
* `!project remove <NAME>`
  * Remove a project (Moderator/Project owner only)
* `!project approve/unapprove <NAME>`
  * Approve or undo the approval of a project (Moderator only)
* `!project close/open <NAME>`
  * Close or open the application window of a project (Moderator/Project owner only)
* `!project apply <NAME> <BIO>`
  * Apply for a project, with your bio in a short paragraph so the project owner can see if you fit
* `!project optout <NAME>`
  * Opt out from a project
* `!project accept/decline <APPLICATION_ID>`
  * Accept/decline an application for your project (Project owner only)

## Dependencies

* [Discord.js](https://discord.js.org) for easy Discord API manipulation
* [PouchDB](https://pouchdb.com) for persistency
* [PouchDB Find](https://github.com/nolanlawson/pouchdb-findm) for easy DB searching
* [text-table](https://github.com/substack/text-table) for simple text table building
* [uws](https://github.com/uNetworking/uWebSockets) for faster WS work for Discord.js
