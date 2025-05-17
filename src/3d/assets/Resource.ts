/**
 * An resource representing objects usable in Babylon.js such as GLTF/GLB file, image file.
 * @param {string} name - Name of the resource (string)
 * @param {string | ArrayBuffer} data - URL or ArrayBuffer of the resource
 */
class Resource {
    private readonly _name: string;
    private readonly _url: string;
    isAvailable: boolean;
    checkedAvailability: boolean;
    isChecking: boolean;

    constructor(name: string, data: string | ArrayBuffer) {
        this._name = name;
        this.isAvailable = true;
        this.checkedAvailability = false;
        this.isChecking = false;

        // // truncate 'data:application/octet-stream;base64,' from base64 string
        // const arrayBuffer = base64ToArrayBuffer(base64.substring(37));
        if (data instanceof ArrayBuffer) {
            const blob = new Blob([data], { type: "application/octet-stream" });
            this._url = URL.createObjectURL(blob);
        } else {
            this._url = data;
        }
    }
    get name(): string {
        return this._name;
    }
    get url(): string {
        return this._url;
    }

    async checkAvailability(): Promise<boolean> {
        this.isChecking = true;
        if (this.checkedAvailability) return this.isAvailable;
        try {
            // check if url is fetchable
            const res = await fetch(this._url);
            this.isAvailable = !res || !res.ok || res.status !== 200 ? false : true;
        } catch {
            this.isAvailable = false;
        } finally {
            this.isChecking = false;
            this.checkedAvailability = true;
        }
        return this.isAvailable;
    }

    dispose() {
        URL.revokeObjectURL(this._url);
    }
}

export default Resource;
