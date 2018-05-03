const Discord = require('discord.js');
const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-find'));
const table = require('text-table');

const client = new Discord.Client();
const { TOKEN, PREFIX, COMMAND, EMBED_COLOR, MOD_PERMISSIONS, DEBUG } = require('./config.json');

const projects = new PouchDB('projects', { auto_compaction: true });
const applicants = new PouchDB('applicants');

class Project {
	constructor(message) {
		const messageFrags = message.content.split(' ');
		const startIndex = messageFrags.splice(0, 2);

		this._id = messageFrags[0];
		this.url = messageFrags[messageFrags.length - 1];
		this.description = message.content.substring(startIndex.join(' ').length + this._id.length + 2, message.content.length - (this.url.length + 1));
		this.testers = 0;
		this.author = message.author.id;
		this.approved = false;
		this.timestamp = Date.now();
		this.closed = false;
	}
}

class Application {
	constructor(message) {
		const messageFrags = message.content.split(' ');
		const cmd = messageFrags.splice(0, 2);
		const name = messageFrags[0];

		this._id = name + '-' + message.author.id;
		this.project = name;
		this.author = message.author.id;
		this.bio = message.content.substr(cmd.join(' ').length + 1 + name.length + 1);
		this.accepted = false;
	}
}

class CodedError extends Error {
	constructor(status = 500, ...params) {
		super(...params);
		this.status = status;
	}
}

const cmdTable = commands => {
	let rows = [
		['COMMAND', 'ARGUMENTS'],
		['', '']
	];
	for (const command in commands) {
		rows.push([command, commands[command][0]]);
		if (commands[command][1] !== '') {
			rows.push(['', '- ' + commands[command][1]]);
		}
	}

	return '```' + table(rows, { align: ['r', 'l'] }) + '```';
}

const codify = row => {
	row.unshift('`');
	row.push('`');
	return row;
}

const OX = bool => {
	return bool ? 'O' : 'X';
}

const dateFormat = date => {
	const d = new Date(date);
	const month = (d.getMonth() + 1).toString().padStart(2, '0');
	const day = (d.getDate()).toString().padStart(2, '0');
	const hour = (d.getHours()).toString().padStart(2, '0');
	const minute = (d.getMinutes()).toString().padStart(2, '0');
	const second = (d.getSeconds()).toString().padStart(2, '0');

	return `${month}-${day} ${hour}:${minute}:${second}`;
}

/**
*		Commands
**/
	const generalCMDs = {
		help: ['', 'Shows all available commands'],
		add: ['<NAME> <DESCRIPTION> <INVITE_URL>', 'Add a new project to the approval queue. A Discord invitation link is preferably used as the invitation URL.'],
		apply: ['<NAME> <BIO>', 'Apply to a project as a tester'],
		optout: ['<NAME>', 'Opt out of a project\'s tester group'],
		list: ['[mine|pending] (optional)', 'See currently active projects'],
		about: ['<NAME>', 'Read about the project']
	}

	const ownerCMDs = {
		remove: ['<NAME>', 'Remove the project altogether'],
		close: ['<NAME>', 'Close the application process'],
		open: ['<NAME>', 'Open the application process'],
		accept: ['<ID>', 'Accept the application request'],
		decline: ['<ID>', 'Decline the application request']
	}

	const modCMDs = {
		remove: ['', ''],
		close: ['', ''],
		open: ['', ''],
		approve: ['<NAME>', 'Approve the project'],
		unapprove: ['<NAME>', 'Unapprove the project']
	}

	const commands = Object.assign({}, modCMDs, ownerCMDs, generalCMDs);

client.on('message', async message => {
	/**
	*		!project
	*			- list
	*			- about
	*			- add
	*			- remove
	*			- approve
	*			- unapprove
	*			- close
	*			- open
	*			- apply
	*			- optout
	*			- accept
	*			- decline
	**/

	if (message.content.substr(0, (PREFIX + COMMAND).length) === `${PREFIX}${COMMAND}`) {
		try {
			let cmd, msg, frags, args;
			let isOwner = false;
			let isMod = (message.channel.type !== 'dm') ? message.member.permissions.has(MOD_PERMISSIONS) : false;

			// Common things
			if (message.content.length > (PREFIX + COMMAND).length + 1) {
				frags = message.content.split(' ');
				cmd = frags[1];
				msg = message.content.substr((PREFIX + COMMAND + cmd).length + 2);

				if (commands[cmd]) {
					if (commands[cmd][0] !== '') {
						args = frags;
						args.splice(0, 2);

						if (commands[cmd][0].charAt(0) === '<') {
							// If no argument is given throw an error, except when no arg is required
							if (message.content.length <= (PREFIX + COMMAND + cmd).length + 2) {
								throw new Error(`Usage: \`${PREFIX}${COMMAND} ${cmd} ${commands[cmd][0]}\``);
							}

							// If argument length is shorter than specified throw
							if (args.length < commands[cmd][0].split(' ').length) {
								throw new Error('Invalid argument length');
							}
						}
					}
				}
			}

		/**
		*		!project    Shows the publically available commands
		**/
			if (message.content.length === 8 || cmd == 'help') {
				const embed = new Discord.RichEmbed()
					.setColor(EMBED_COLOR)
					.addField('Usage', `\`${PREFIX}project <COMMAND> <ARGUMENTS>\``)
					.addField('General commands', cmdTable(generalCMDs))
					.addField('Project owner commands', cmdTable(ownerCMDs));

				if (isMod) {
					embed.addField('Moderator commands', cmdTable(modCMDs));
				}

				message.author.send(embed);
			}

		/**
		*		!project list    See currently active projects
		**/
			if (cmd === 'list') {
				let align, rows, embed;

			/**
			*		!project list mine    See my projects
			**/
				if (args[0] === 'mine') {

					await projects.createIndex({
						index: { fields: ['author'] }
					});

					const result = await projects.find({
						selector: { author: message.author.id }
					});

					align = ['l', 'l', 'c', 'c', 'r', 'l'];
					rows = result.docs.map(row => {
						return codify([row._id, OX(row.approved), OX(row.closed), row.testers]);
					});
					rows.unshift(
						codify(['NAME', 'APPROVED', 'CLOSED', 'TESTERS'])
					);

					let text = table(rows, { align: align });
					if (rows.length <= 1) {
						text = '`You have no ongoing project`';
					}

					embed = new Discord.RichEmbed()
						.setColor(EMBED_COLOR)
						.setTitle('Your ongoing projects')
						.setDescription(text);
					message.author.send(embed);
				}

			/**
			*		!project list pending    See pending projects (mod only)
			**/
				else if (args[0] === 'pending' && isMod) {

					await projects.createIndex({
						index: { fields: ['approved'] }
					});

					const result = await projects.find({
						selector: { approved: false }
					});

					align = ['l', 'l', 'r', 'l'];
					rows = result.docs.map(row => {
						let author = client.users.get(row.author);
						author = author.username + '#' + author.discriminator;
						return codify([row._id, author]);
					});
					rows.unshift(
						codify(['NAME', 'AUTHOR'])
					);

					let text = table(rows, { align: align });
					if (rows.length <= 1) {
						text = '`There are no projects waiting for approval`';
					}

					embed = new Discord.RichEmbed()
						.setColor(EMBED_COLOR)
						.setTitle('Currently pending projects')
						.setDescription(text);
					message.author.send(embed);

			/**
			*		!project list    See active projects
			**/
				} else if (args.length === 0) {
					const docs = await projects.allDocs({ include_docs: true });

					align = ['l', 'l', 'r'];
					rows = [ codify(['NAME', 'AUTHOR', 'TESTERS']) ];

					if (isMod) {
						align.splice(2, 0, 'c', 'c');
						rows[0].splice(3, 0, 'APPROVED', 'CLOSED');
					}

					// For backtick columns
					align.unshift('l');
					align.push('l');

					for (let i = 0; i < docs.rows.length; i++) {
						const doc = docs.rows[i].doc;

						// Skip over if index document
						if (doc.language === 'query') {
							continue;
						}

						// Get author in <name>#<discriminator> format
						let author = client.users.get(doc.author);
						author = author.username + '#' + author.discriminator;

						let row = codify([doc._id, author, doc.testers]);

						// Mods get to see more
						if (isMod) {
							row.splice(3, 0, OX(doc.approved), OX(doc.closed));
						}

						if (isMod || (doc.approved && !doc.closed)) {
							rows.push(row);
						}
					}

					let text = table(rows, { align: align });
					if (rows.length <= 1) {
						text = '`No ongoing projects yet`';
					}

					embed = new Discord.RichEmbed()
						.setColor(EMBED_COLOR)
						.setTitle(isMod ? 'All projects' : 'Active projects')
						.setDescription(text);
					message.author.send(embed);
				}
			}

		/**
		*		!project about <name>    See currently active projects
		**/
			else if (cmd === 'about') {
				const doc = await projects.get(args[0]);
				const author = client.users.get(doc.author)

				const embed = new Discord.RichEmbed()
					.setColor(EMBED_COLOR)
					.addField('Project name', doc._id, true)
					.addField('Project owner', author.username + '#' + author.discriminator, true)
					.addField('Number of testers', doc.testers, true)
					.addField('Created date', dateFormat(doc.timestamp), true)
					.addField('Project description', doc.description)

				message.author.send(embed);
			}

		/**
		*		!project add <name> <description> <inviteURL>    Add a new project to the approval queue
		**/
			else if (cmd === 'add') {
				const project = new Project(message);

				if (!project._id.match(/[a-zA-Z0-9_-]+/)) {
					throw new Error ('Project name contains invalid characters');
				}

				// Do a URL check
				if (!project.url.match(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/)) {
					throw new Error('Invalid invite URL was given');
				}

				await projects.put(project);

				message.author.send(`:ok_hand: :: A new project \`${project._id}\` has been added to the approval queue`);
			}

		/**
		*		!project remove <name>    Remove a new project from the db (mod/author only)
		**/
			if (cmd === 'remove') {

				// Get the project with the name
				const doc = await projects.get(msg);

				if (message.author.id !== doc.author && !isMod) { 
					throw new CodedError(403);
				}

				const applications = await applicants.allDocs({
					include_docs: true,
					startkey: doc._id,
					endkey: doc._id + '\ufff0'
				});

				let rows = [];
				for (let i = 0; i < applications.rows.length; i++) {
					let row = applications.rows[i];
					rows.push({
						_id: row.doc._id,
						_rev: row.doc._rev,
						_deleted: true
					});
					client.users.get(row.doc.author).send(`:worried: :: The project you have applied (\`${doc._id}\`) was removed`);
				}

				await projects.remove(doc);
				await applicants.bulkDocs(rows);

				message.author.send(`:ok_hand: :: Project \`${doc._id}\` has been removed`);

				if (doc.author !== message.author.id) {
					client.users.get(doc.author).send(`:scream: :: Your project \`${doc._id}\` has been removed by @${message.author.username}#${message.author.discriminator}`);
				}
			}

		/**
		*		!project approve <name>    Approve a project (mod only)
		**/
			if (cmd === 'approve') {

				// Do a check for mod permissions
				if (!isMod) { 
					throw new CodedError(511);
				}

				// Get the project with the name
				let doc = await projects.get(args[0]);

				if (doc.author === message.author.id && !DEBUG) {
					throw new Error('Obviously you shouldn\'t approve your own project, should you?');
				}

				// Check whether if the project was already approved by someone
				if (doc.approved !== false) {
					const author = client.users.get(doc.author);
					throw new Error(`Project \`${doc._id}\` was already approved by ${author.username + '#' + author.discriminator}`);
				}

				doc.approved = message.author.id;
				projects.put(doc);

				message.author.send(`:thumbsup: :: Projectst \`${doc._id}\` has been approved`);
				client.users.get(doc.author).send(`:heart_eyes: :: Your project \`${doc._id}\` has been approved by @${message.author.username}#${message.author.discriminator}!`);
			}

		/**
		*		!project unapprove <name>    Unapprove a project (mod only)
		**/
			if (cmd === 'unapprove') {

				// Do a check for mod permissions
				if (!isMod) {
					throw new CodedError(511);
				}

				// Get the project with the name
				let doc = await projects.get(args[0]);

				// Check the approval state first
				if (doc.approved === false) {
					throw new Error(`Project \`${doc._id}\` was never approved`);
				}

				doc.approved = false;
				projects.put(doc);

				message.author.send(`:thumbsdown: :: Project \`${doc._id}\` has been unapproved`);
				client.users.get(doc.author).send(`:fearful: :: Your project \`${doc._id}\` has been unapproved by @${message.author.username}#${message.author.discriminator}`);
			}

		/**
		*		!project close <name>    Close a project (mod/author only)
		**/
			if (cmd === 'close') {
				let doc = await projects.get(args[0]);

				// Do a check for mod permissions
				if (message.author.id !== doc.author && !isMod) { 
					throw new CodedError(403);
				}

				// Check the closedness first
				if (doc.closed === true) {
					throw new Error(`Project \`${doc._id}\` is already closed`);
				}

				// Update the doc and send message
				doc.closed = true;
				projects.put(doc);

				message.author.send(`:no_entry_sign: :: Project \`${doc._id}\` has been successfully closed`);

				if (doc.author !== message.author.id) {
					client.users.get(doc.author).send(`:worried: :: Your project \`${doc._id}\` has been closed by @${message.author.username}#${message.author.discriminator}`);
				}
			}

		/**
		*		!project open <name>    Open a project (mod/author only)
		**/
			if (cmd === 'open') {
				let doc = await projects.get(args[0]);

				// Do a check for mod permissions
				if (message.author.id !== doc.author && !isMod) { 
					throw new CodedError(403);
				}

				// Check the openness first
				if (doc.closed === false) {
					throw new Error(`Project \`${doc._id}\` is already open`);
				}

				doc.closed = false;
				projects.put(doc);

				message.author.send(`:o: :: Project \`${doc._id}\` has been successfully opened`);

				if (doc.author !== message.author.id) {
					client.users.get(doc.author).send(`:smile: :: Your project \`${doc._id}\` has been opened by @${message.author.username}#${message.author.discriminator}`);
				}
			}

		/**
		*		!project apply <name> <bio>    Apply for a project
		**/
			if (cmd === 'apply') {

				// Get the project as a doc
				const doc = await projects.get(args[0]);

				if (doc.author === message.author.id && !DEBUG) {
					throw new Error('Obviously you shouldn\'t apply for your own project, should you?');
				}

				// Check the approval state first
				if (doc.approved === false) {
					throw new Error(`Project \`${doc._id}\` is yet to be approved by mods`);
				}

				// and then check if the project application is closed
				if (doc.closed) {
					throw new Error(`Project \`${doc._id}\` does not accept applications right now`);
				}

				// Put the new application to the db
				const application = new Application(message);
				await applicants.put(application);
				
				message.author.send(`:pray: :: You have successfully applied to the project \`${doc._id}\`. The project owner will decide if you will get on`);

				const author = client.users.get(doc.author);
				const embed = new Discord.RichEmbed()
					.setColor('#cc1133')
					.setAuthor(message.author.username + '#' + message.author.discriminator, message.author.displayAvatarURL)
					.setTitle(`A new applicant for the project "${doc._id}"`)
					.setDescription('As the project owner, you can either accept or decline with commands below.')
					.addField('Project name', application.project)
					.addField('Applicant\'s bio', application.bio)
					.addField('To accept:', `\`!project accept ${application._id}\``)
					.addField('To decline:', `\`!project decline ${application._id}\``);

				author.send(embed);
			}

		/**
		*		!project optout <name>    Opt out of a project's tester group
		**/
			if (cmd === 'optout') {

				const project = await projects.get(args[0]);
				const application = await applicants.get(args[0] + '-' + message.author.id);
				const author = client.users.get(project.author);

				if (application.accepted) {
					project._rev = project._rev;
					project.testers--;
					await projects.put(project);
				}
				await applicants.remove(application);
				
				message.author.send(`:wave: :: You have successfully opted out of the project \`${project._id}\`. The project owner will be notified.`);
				author.send(`:wave: :: User ${message.author.username}#${message.author.discriminator} has opted out of your project \`${project._id}\`.`);
			}

		/**
		*		!project accept/decline
		**/
			if (cmd === 'accept' || cmd === 'decline') {
				const author = args[0].split('-').splice(-1)[0];
				const name = args[0].substr(0, args[0].length - author.length - 1);

				let project = await projects.get(name);

				// Project owner check
				if (message.author.id !== project.author) {
					throw new CodedError(403);
				}
				
				let application = await applicants.get(args[0]);
				const user = client.users.get(author);

			/**
			*		!project accept <ID>    Accept the application request (author only)
			**/
				if (cmd === 'accept') {

					project._rev = project._rev;
					project.testers++;
					await projects.put(project);

					application._rev = application._rev;
					application.accepted = true;
					await applicants.put(application);

					message.author.send(`:smiley: :: You have successfully accepted ${user.username}#${user.discriminator} to your project. The user will be notified...`);
					user.send(`:smiley: :: You have been accepted to \`${project._id}\` by the project owner! You can use the invite link below to join its group.`);
					user.send(project.url);
				}

			/**
			*		!project decline <ID>    Decline the application request (author only)
			**/
				if (cmd === 'decline') {
					await applicants.remove(application);

					message.author.send(`:grimacing: :: You have successfully declined the request from ${user.username}#${user.discriminator}. The user will be notified...`);
					user.send(`:grimacing: :: You have been declined from \`${project._id}\` by the project owner. Better luck next time...`);
				}

			}

			console.log(`${dateFormat(Date.now())} - INFO :: !project ${cmd} by ${message.author.username}#${message.author.discriminator}`);

		} catch(err) {
			console.log(`${dateFormat(Date.now())} - ERROR :: ${err.message} by ${message.author.username}#${message.author.discriminator}`);

			if (DEBUG) {
				console.error(err);
			}

			if (err.status === 404) {
				message.author.send(':dizzy_face: :: There are no such projects/applications');
			} else if (err.status === 409) {
				message.author.send(':sweat_smile: :: Your project/application is already in process');
			} else if (err.status === 511) {
				//message.author.send(':cold_sweat: :: Only mods can use this command');
			} else if (err.status === 403) {
				message.author.send(':cold_sweat: :: Only the author of the project can use this command');
			} else {
				message.author.send(':thinking: :: ' + err.message);
			}
		}
	}
});

client.on('ready', () => {
	console.log(dateFormat(Date.now()) + ' - Discord bot ready to go into the action!');
});

client.login(TOKEN);

process.once('SIGINT', () => {
	client.destroy()
		.then(() => {
			console.log(dateFormat(Date.now()) + ' - Goodbye cruel world...');
			process.kill(process.pid);
		})
});
