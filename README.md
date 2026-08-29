# beanroom 🫘

> a little anon chatroom that keyboard only typa project. you just `ssh` in and start talking to strangers (scawy).

You don't need an account chat. If you want to be recognizable, `/register` a username and password and your name + color preference get saved.

also: be nice. that's the first rule. just be a good human being.

## why?

`ssh` is already on every machine you own, and there's something genuinely fun about a chatroom that feels like something retro.

## features

- **TUI** — Full terminal buffer usage so as to not just be like a command but a proper hecking chatroom
- **channels** — channels like #general (totally not from discord)
- **themes** — `tokyo-night` and `gruvbox` are made for now

## try it live

```sh
ssh beanoni.xyz -p 2222
```

# technologia

I used `ssh2` library with `gradient-string` for gradients.

| command                         | what it does                                     |
| ------------------------------- | ------------------------------------------------ |
| `/register <user> <pass>`       | create an account                                |
| `/login <user> <pass>`          | log in (restores saved color)                    |
| `/logout`                       | log out                                          |
| `/join <channel> [description]` | join a channel, or create it if it doesn't exist |
| `/list`                         | open the browsable channel list                  |
| `/channels`                     | list channel names inline                        |
| `/announce <text>`              | broadcast a popup to everyone in the room        |
| `/whoami`                       | show your session/identity info                  |
| `/color SOLID #hex`             | set your name to a solid color                   |
| `/color GRADIENT #hex1 #hex2`   | set your name to a gradient (saved if logged in) |
| `/theme tokyo-night\|gruvbox`   | swap the palette live                            |
| `/clear`                        | clear the screen                                 |
| `/help`                         | show the help text                               |

## contributing

bug reports, ideas, and silly channel names are all welcome — check [CONTRIBUTING.md](CONTRIBUTING.md) first. this project follows the [Hack Club Code of Conduct](https://hackclub.com/conduct) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## ai disclosure

I used ai to help me refactor and debug issues.

written with <3 by BeanieMan · come hang out in `#general`
