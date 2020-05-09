"use strict";

/*
 * Created with @iobroker/create-adapter v1.21.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const request = require("request");
const traverse = require("traverse");
const crypto = require("crypto");
class Midea extends utils.Adapter {
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: "midea",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        this.on("unload", this.onUnload.bind(this));
        this.jar = request.jar();
        this.updateInterval = null;
        this.reauthInterval = null;
        this.atoken;
        this.sId;
        this.hgIdArray = [];
        this.appKey = "ff0cf6f5f0c3471de36341cab3f7a9af";
        this.baseHeader = {
            "User-Agent": "Dalvik/2.1.0 (Linux; U; Android 7.0; SM-G935F Build/NRD90M)",
        };
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here

        // Reset the connection indicator during startup
        this.setState("info.connection", false, true);
        this.login().then(() => {
            this.log.debug("Login successful");
            this.setState("info.connection", true, true);
            this.getUserList().then(() => {});
        });

        // in this template all states changes inside the adapters namespace are subscribed
        this.subscribeStates("*");
    }
    login() {
        return new Promise((resolve, reject) => {
            this.jar = request.jar();
            const form = {
                loginAccount: this.config.user,
                clientType: "1",
                src: "17",
                appId: "1117",
                format: "2",
                stamp: this.getStamp(),
                language: "de_DE",
            };
            const url = "https://mapp.appsmb.com/v1/user/login/id/get";
            const sign = this.getSign(url, form);
            form.sign = sign;
            request.post(
                {
                    url: url,
                    headers: this.baseHeader,
                    followAllRedirects: true,
                    json: true,
                    form: form,
                    jar: this.jar,
                    gzip: true,
                },
                (err, resp, body) => {
                    if (err || (resp && resp.statusCode >= 400) || !body) {
                        this.log.error("Failed to login");
                        err && this.log.error(err);
                        body && this.log.error(JSON.stringify(body));
                        resp && this.log.error(resp.statusCode);
                        reject();
                        return;
                    }
                    this.log.debug(JSON.stringify(body));
                    if (body.errorCode && body.errorCode !== "0") {
                        this.log.error(body.msg);
                        reject();
                        return;
                    }
                    if (body.result) {
                        const loginId = body.result.loginId;
                        const password = this.getSignPassword(loginId);
                        const form = {
                            loginAccount: this.config.user,
                            src: "17",
                            format: "2",
                            stamp: this.getStamp(),
                            language: "de_DE",
                            password: password,
                            clientType: "1",
                            appId: "1117",
                        };
                        const url = "https://mapp.appsmb.com/v1/user/login";
                        const sign = this.getSign(url, form);
                        form.sign = sign;
                        request.post(
                            {
                                url: url,
                                headers: this.baseHeader,
                                followAllRedirects: true,
                                json: true,
                                form: form,
                                jar: this.jar,
                                gzip: true,
                            },
                            (err, resp, body) => {
                                if (err || (resp && resp.statusCode >= 400) || !body) {
                                    this.log.error("Failed to login");
                                    err && this.log.error(err);
                                    body && this.log.error(JSON.stringify(body));
                                    resp && this.log.error(resp.statusCode);
                                    reject();
                                    return;
                                }
                                this.log.debug(JSON.stringify(body));
                                if (body.errorCode && body.errorCode !== "0") {
                                    this.log.error(body.msg);
                                    reject();
                                    return;
                                }
                                if (body.result) {
                                    this.atoken = body.result.accessToken;
                                    this.sId = body.result.sessionId;
                                    this.generateDataKey();
                                    resolve();
                                }
                            }
                        );
                    }
                }
            );
        });
    }
    getUserList() {
        return new Promise((resolve, reject) => {
            const form = {
                src: "17",
                format: "2",
                stamp: this.getStamp(),
                language: "de_DE",
                sessionId: this.sId,
            };
            const url = "https://mapp.appsmb.com/v1/appliance/user/list/get";
            const sign = this.getSign(url, form);
            form.sign = sign;
            request.post(
                {
                    url: url,
                    headers: this.baseHeader,
                    followAllRedirects: true,
                    json: true,
                    form: form,
                    jar: this.jar,
                    gzip: true,
                },
                (err, resp, body) => {
                    if (err || (resp && resp.statusCode >= 400) || !body) {
                        this.log.error("Failed to login");
                        err && this.log.error(err);
                        body && this.log.error(JSON.stringify(body));
                        resp && this.log.error(resp.statusCode);
                        reject();
                        return;
                    }
                    this.log.debug(JSON.stringify(body));
                    if (body.errorCode && body.errorCode !== "0") {
                        this.log.error(body.msg);
                        reject();
                        return;
                    }
                    try {
                        if (body.result && body.result.list && body.result.list.length > 0) {
                            body.result.list.forEach(async (currentElement) => {
                                this.hgIdArray.push(currentElement.id);

                                this.setObjectNotExists(currentElement.id, {
                                    type: "device",
                                    common: {
                                        name: currentElement.name,
                                        role: "indicator",
                                        write: false,
                                        read: true,
                                    },
                                    native: {},
                                });
                                Object.keys(currentElement).forEach((key) => {
                                    this.setObjectNotExists(currentElement.id + ".general." + key, {
                                        type: "state",
                                        common: {
                                            name: key,
                                            role: "indicator",
                                            type: typeof currentElement[key],
                                            write: false,
                                            read: true,
                                        },
                                        native: {},
                                    });
                                    this.setState(currentElement.id + ".general." + key, currentElement[key], true);
                                });
                                this.controls = [
                                    { name: "powerState", type: "boolean", unit: "" },
                                    { name: "ecoMode", type: "boolean", unit: "" },
                                    { name: "swingMode", type: "boolean", unit: "" },
                                    { name: "turboMode", type: "boolean", unit: "" },
                                    { name: "targetTemperature", type: "number", unit: "C" },
                                    { name: "operationalMode", type: "number", unit: "" },
                                    { name: "fanSpeed", type: "number", unit: "" },
                                ];
                                for (const property of this.controls) {
                                    await this.setObjectNotExistsAsync(currentElement.id + ".control." + property.name, {
                                        type: "state",
                                        common: {
                                            name: property.name,
                                            role: "switch",
                                            type: property.type,
                                            write: true,
                                            read: true,
                                            unit: property.unit || "",
                                        },
                                        native: {},
                                    });
                                }
                            });
                        }
                        resolve();
                    } catch (error) {
                        this.log.error(error);
                        this.log.error(error.stack);
                        reject();
                    }
                }
            );
        });
    }
    sendCommand(applianceId, order) {
        return new Promise((resolve, reject) => {
            const orderEncode = this.encode(order);
            const orderEncrypt = this.encryptAes(orderEncode);
            //TODO move orderEncrypt to hex need a length of 480

            const form = {
                applianceId: applianceId,
                src: "17",
                format: "2",
                funId: "FC02", //maybe it is also "0000"
                order: orderEncrypt,
                stamp: this.getStamp(),
                language: "de_DE",
                sessionId: this.sId,
            };
            const url = "https://mapp.appsmb.com/v1/appliance/transparent/send";
            const sign = this.getSign(url, form);
            form.sign = sign;
            request.post(
                {
                    url: url,
                    headers: this.baseHeader,
                    followAllRedirects: true,
                    json: true,
                    form: form,
                    jar: this.jar,
                    gzip: true,
                },
                (err, resp, body) => {
                    if (err || (resp && resp.statusCode >= 400) || !body) {
                        this.log.error("Failed to login");
                        err && this.log.error(err);
                        body && this.log.error(JSON.stringify(body));
                        resp && this.log.error(resp.statusCode);
                        reject();
                        return;
                    }
                    this.log.debug(JSON.stringify(body));
                    if (body.errorCode && body.errorCode !== "0") {
                        this.log.error(body.msg);
                        reject();
                        return;
                    }
                    try {
                        this.log.info("send successful");
                        /*TODO check body.result.reply with all command getter and set curent status
                        this.decode(this.decryptAes(body.result.reply))

                        const command = new setCommand();
                        for (const property of this.controls) {
                            if (id.indexOf("powerState") !== -1) {
                                this.setState(applianceId + ".control." + property.name, command.powerState(), true);
                            }
                        }
 */
                        resolve();
                    } catch (error) {
                        this.log.error(error);

                        this.log.error(error.stack);
                        reject();
                    }
                }
            );
        });
    }
    getSign(path, form) {
        const postfix = "/" + path.split("/").slice(3).join("/");
        const ordered = {};
        Object.keys(form)
            .sort()
            .forEach(function (key) {
                ordered[key] = form[key];
            });
        const query = Object.keys(ordered)
            .map((key) => key + "=" + ordered[key])
            .join("&");

        return crypto
            .createHash("sha256")
            .update(postfix + query + this.appKey)
            .digest("hex");
    }
    getSignPassword(loginId) {
        const pw = crypto.createHash("sha256").update(this.config.password).digest("hex");

        return crypto
            .createHash("sha256")
            .update(loginId + pw + this.appKey)
            .digest("hex");
    }
    getStamp() {
        const date = new Date();
        return date.toISOString().slice(0, 19).replace(/-/g, "").replace(/:/g, "").replace(/T/g, "");
    }

    generateDataKey() {
        const md5AppKey = crypto.createHash("md5").update(this.appKey).digest("hex");
        const decipher = crypto.createDecipheriv("aes-128-ecb", md5AppKey.slice(0, 16), "");
        const dec = decipher.update(this.atoken, "hex", "utf8");
        this.dataKey = dec;
        return dec;
    }
    decryptAes(reply) {
        if (!this.dataKey) {
            this.generateDataKey();
        }
        const decipher = crypto.createDecipheriv("aes-128-ecb", this.dataKey, "");
        const dec = decipher.update(reply, "hex", "utf8");
        return dec.split(",");
    }
    encode(data) {
        return data;

        /* TOdO
          normalized = []
        for b in data:
            if b >= 128:
                b = b - 256
            normalized.append(str(b))

        string = ','.join(normalized)
        return bytearray(string.encode('ascii'))
        */
    }
    decode(data) {
        return data;
        // data = [int(a) for a in data.decode('ascii').split(',')]
        // for i in range(len(data)):
        //     if data[i] < 0:
        //         data[i] = data[i] + 256
        // return bytearray(data)
    }
    encryptAes(query) {
        if (!this.dataKey) {
            this.generateDataKey();
        }
        const cipher = crypto.createCipheriv("aes-128-ecb", this.dataKey, "");
        let ciph = cipher.update(query.join(","), "utf8", "hex");
        ciph += cipher.final("hex");
        return ciph;
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.log.info("cleaned everything up...");
            clearInterval(this.updateInterval);
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state && !state.ack) {
            const deviceId = id.split(".")[2];
            const command = new setCommand();
            if (id.indexOf("powerState") !== -1) {
                command.powerState = state.val;
            }
            if (id.indexOf("ecoMode") !== -1) {
                command.ecoMode = state.val;
            }
            if (id.indexOf("swingMode") !== -1) {
                command.swingMode = state.val;
            }
            if (id.indexOf("turboMode") !== -1) {
                command.turboMode = state.val;
            }
            if (id.indexOf("targetTemperature") !== -1) {
                command.targetTemperature = state.val;
            }
            if (id.indexOf("operationalMode") !== -1) {
                command.operationalMode = state.val;
            }
            if (id.indexOf("fanSpeed") !== -1) {
                command.fanSpeed = state.val;
            }

            const pktBuilder = new packetBuilder()
            pktBuilder.command = command;
            const data = pktBuilder.finalize()

            this.sendCommand(deviceId, data);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Midea(options);
} else {
    // otherwise start the instance directly
    new Midea();
}

class crc8 {
    static crc8_854_table = [
        0x00,
        0x5e,
        0xbc,
        0xe2,
        0x61,
        0x3f,
        0xdd,
        0x83,
        0xc2,
        0x9c,
        0x7e,
        0x20,
        0xa3,
        0xfd,
        0x1f,
        0x41,
        0x9d,
        0xc3,
        0x21,
        0x7f,
        0xfc,
        0xa2,
        0x40,
        0x1e,
        0x5f,
        0x01,
        0xe3,
        0xbd,
        0x3e,
        0x60,
        0x82,
        0xdc,
        0x23,
        0x7d,
        0x9f,
        0xc1,
        0x42,
        0x1c,
        0xfe,
        0xa0,
        0xe1,
        0xbf,
        0x5d,
        0x03,
        0x80,
        0xde,
        0x3c,
        0x62,
        0xbe,
        0xe0,
        0x02,
        0x5c,
        0xdf,
        0x81,
        0x63,
        0x3d,
        0x7c,
        0x22,
        0xc0,
        0x9e,
        0x1d,
        0x43,
        0xa1,
        0xff,
        0x46,
        0x18,
        0xfa,
        0xa4,
        0x27,
        0x79,
        0x9b,
        0xc5,
        0x84,
        0xda,
        0x38,
        0x66,
        0xe5,
        0xbb,
        0x59,
        0x07,
        0xdb,
        0x85,
        0x67,
        0x39,
        0xba,
        0xe4,
        0x06,
        0x58,
        0x19,
        0x47,
        0xa5,
        0xfb,
        0x78,
        0x26,
        0xc4,
        0x9a,
        0x65,
        0x3b,
        0xd9,
        0x87,
        0x04,
        0x5a,
        0xb8,
        0xe6,
        0xa7,
        0xf9,
        0x1b,
        0x45,
        0xc6,
        0x98,
        0x7a,
        0x24,
        0xf8,
        0xa6,
        0x44,
        0x1a,
        0x99,
        0xc7,
        0x25,
        0x7b,
        0x3a,
        0x64,
        0x86,
        0xd8,
        0x5b,
        0x05,
        0xe7,
        0xb9,
        0x8c,
        0xd2,
        0x30,
        0x6e,
        0xed,
        0xb3,
        0x51,
        0x0f,
        0x4e,
        0x10,
        0xf2,
        0xac,
        0x2f,
        0x71,
        0x93,
        0xcd,
        0x11,
        0x4f,
        0xad,
        0xf3,
        0x70,
        0x2e,
        0xcc,
        0x92,
        0xd3,
        0x8d,
        0x6f,
        0x31,
        0xb2,
        0xec,
        0x0e,
        0x50,
        0xaf,
        0xf1,
        0x13,
        0x4d,
        0xce,
        0x90,
        0x72,
        0x2c,
        0x6d,
        0x33,
        0xd1,
        0x8f,
        0x0c,
        0x52,
        0xb0,
        0xee,
        0x32,
        0x6c,
        0x8e,
        0xd0,
        0x53,
        0x0d,
        0xef,
        0xb1,
        0xf0,
        0xae,
        0x4c,
        0x12,
        0x91,
        0xcf,
        0x2d,
        0x73,
        0xca,
        0x94,
        0x76,
        0x28,
        0xab,
        0xf5,
        0x17,
        0x49,
        0x08,
        0x56,
        0xb4,
        0xea,
        0x69,
        0x37,
        0xd5,
        0x8b,
        0x57,
        0x09,
        0xeb,
        0xb5,
        0x36,
        0x68,
        0x8a,
        0xd4,
        0x95,
        0xcb,
        0x29,
        0x77,
        0xf4,
        0xaa,
        0x48,
        0x16,
        0xe9,
        0xb7,
        0x55,
        0x0b,
        0x88,
        0xd6,
        0x34,
        0x6a,
        0x2b,
        0x75,
        0x97,
        0xc9,
        0x4a,
        0x14,
        0xf6,
        0xa8,
        0x74,
        0x2a,
        0xc8,
        0x96,
        0x15,
        0x4b,
        0xa9,
        0xf7,
        0xb6,
        0xe8,
        0x0a,
        0x54,
        0xd7,
        0x89,
        0x6b,
        0x35,
    ];

    static calculate(data) {
        let crc_value = 0;
        for (let m of data) {
            let k = crc_value ^ m;
            if (k > 256) k -= 256;
            if (k < 0) k += 256;
            crc_value = crc8.crc8_854_table[k];
        }
        return crc_value;
    }
}

class baseCommand {
    constructor(device_type = 0xac) {
        // More magic numbers. I'm sure each of these have a purpose, but none of it is documented in english. I might make an effort to google translate the SDK
        this.data = [
            0xaa,
            0x23,
            0xac,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x03,
            0x02,
            0x40,
            0x81,
            0x00,
            0xff,
            0x03,
            0xff,
            0x00,
            0x30,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x03,
            0xcc,
        ];
        this.data[0x02] = device_type;
    }

    finalize() {
        // Add the CRC8
        this.data[0x1d] = crc8.calculate(this.data.slice(16));
        // Set the length of the command data
        this.data[0x01] = this.data.length;
        return this.data;
    }
}

class setCommand extends baseCommand {
    constructor(device_type) {
        super(device_type);
    }

    get audibleFeedback() {
        return this.data[0x0b] & 0x42;
    }

    set audibleFeedback(feedbackEnabled) {
        this.data[0x0b] &= ~0x42; // Clear the audible bits
        this.data[0x0b] |= feedbackEnabled ? 0x42 : 0;
    }

    get powerState() {
        return this.data[0x0b] & 0x01;
    }

    set powerState(state) {
        this.data[0x0b] &= ~0x01; // Clear the power bit
        this.data[0x0b] |= state ? 0x01 : 0;
    }

    get targetTemperature() {
        return this.data[0x0c] & 0x1f;
    }

    set targetTemperature(temperatureCelsius) {
        this.data[0x0c] &= ~0x1f; // Clear the temperature bits
        this.data[0x0c] |= (temperatureCelsius & 0xf) | ((temperatureCelsius << 4) & 0x10);
    }

    get operationalMode() {
        return (this.data[0x0c] & 0xe0) >> 5;
    }

    set operationalMode(mode) {
        this.data[0x0c] &= ~0xe0; // Clear the mode bit
        this.data[0x0c] |= (mode << 5) & 0xe0;
    }

    get fanSpeed() {
        return this.data[0x0d];
    }

    set fanSpeed(speed) {
        this.data[0x0d] = speed;
    }

    get ecoMode() {
        return this.data[0x13] > 0;
    }

    set ecoMode(ecoModeEnabled) {
        this.data[0x13] = ecoModeEnabled ? 0xff : 0;
    }

    get swingMode() {
        return this.data[0x11];
    }

    set swingMode(mode) {
        this.data[0x11] &= ~0x0f; // Clear the mode bit
        this.data[0x11] |= mode & 0x0f;
    }

    get turboMode() {
        return this.data[0x14] > 0;
    }

    set turboMode(turboModeEnabled) {
        this.data[0x14] = turboModeEnabled ? 0x02 : 0;
    }
}

class packetBuilder {
    constructor() {
        this.command = null;

        // Init the packet with the header data. Weird magic numbers, I'm not sure what they all do, but they have to be there (packet length at 0x4)
        this.packet = [
            0x5a,
            0x5a,
            0x01,
            0x11,
            0x5c,
            0x00,
            0x20,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x0e,
            0x03,
            0x12,
            0x14,
            0xc6,
            0x79,
            0x00,
            0x00,
            0x00,
            0x05,
            0x0a,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x02,
            0x00,
            0x00,
            0x00,
        ];
    }

    set command(command) {
        this.command = command.finalize();
    }

    finalize() {
        // Append the command data to the packet
        this.packet = this.packet.concat(this.command);
        // Append a basic checksum of the command to the packet (This is apart from the CRC8 that was added in the command)
        this.packet = this.packet.concat([this.checksum(this.command.slice(1))]);
        // Ehh... I dunno, but this seems to make things work. Pad with 0's
        this.packet = this.packet.concat((new Array(46 - this.command.length)).fill(0));
        // Set the packet length in the packet!
        this.packet[0x04] = this.packet.length;
        return this.packet;
    }

    checksum(data) {
        return 255 - (data.reduce((a, b) => a + b) % 256) + 1;
    }
}
