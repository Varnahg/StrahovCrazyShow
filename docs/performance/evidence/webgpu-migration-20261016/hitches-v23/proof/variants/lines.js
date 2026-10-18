/**
 * Manages the defines for the Material
 */
export class MaterialDefines {
    /**
     * Creates a new instance
     * @param externalProperties list of external properties to inject into the object
     */
    constructor(externalProperties) {
        this.VERTEXOUTPUT_INVARIANT = false;
        /** @internal */
        this._keys = [];
        this._isDirty = true;
        /** @internal */
        this._areLightsDirty = true;
        /** @internal */
        this._areLightsDisposed = false;
        /** @internal */
        this._areAttributesDirty = true;
        /** @internal */
        this._areTexturesDirty = true;
        /** @internal */
        this._areFresnelDirty = true;
        /** @internal */
        this._areMiscDirty = true;
        /** @internal */
        this._arePrePassDirty = true;
        /** @internal */
        this._areImageProcessingDirty = true;
        /** @internal */
        this._normals = false;
        /** @internal */
        this._uvs = false;
        /** @internal */
        this._needNormals = false;
        /** @internal */
        this._needUVs = false;
        this._externalProperties = externalProperties;
        // Initialize External Properties
        if (externalProperties) {
            for (const prop in externalProperties) {
                if (Object.prototype.hasOwnProperty.call(externalProperties, prop)) {
                    this._setDefaultValue(prop);
                }
            }
        }
    }
    /**
     * Specifies if the material needs to be re-calculated
     */
    get isDirty() {
        return this._isDirty;
    }
    /**
     * Marks the material to indicate that it has been re-calculated
     */
    markAsProcessed() {
        this._isDirty = false;
        this._areAttributesDirty = false;
        this._areTexturesDirty = false;
        this._areFresnelDirty = false;
        this._areLightsDirty = false;
        this._areLightsDisposed = false;
        this._areMiscDirty = false;
        this._arePrePassDirty = false;
        this._areImageProcessingDirty = false;
    }
    /**
     * Marks the material to indicate that it needs to be re-calculated
     */
    markAsUnprocessed() {
        this._isDirty = true;
    }
    /**
     * Marks the material to indicate all of its defines need to be re-calculated
     */
    markAllAsDirty() {
        this._areTexturesDirty = true;
        this._areAttributesDirty = true;
        this._areLightsDirty = true;
        this._areFresnelDirty = true;
        this._areMiscDirty = true;
        this._arePrePassDirty = true;
        this._areImageProcessingDirty = true;
        this._isDirty = true;
    }
    /**
     * Marks the material to indicate that image processing needs to be re-calculated
     */
    markAsImageProcessingDirty() {
        this._areImageProcessingDirty = true;
        this._isDirty = true;
    }
    /**
     * Marks the material to indicate the lights need to be re-calculated
     * @param disposed Defines whether the light is dirty due to dispose or not
     */
    markAsLightDirty(disposed = false) {
        this._areLightsDirty = true;
        this._areLightsDisposed = this._areLightsDisposed || disposed;
        this._isDirty = true;
    }
    /**
     * Marks the attribute state as changed
     */
    markAsAttributesDirty() {
        this._areAttributesDirty = true;
        this._isDirty = true;
    }
    /**
     * Marks the texture state as changed
     */
    markAsTexturesDirty() {
        this._areTexturesDirty = true;
        this._isDirty = true;
    }
    /**
     * Marks the fresnel state as changed
     */
    markAsFresnelDirty() {
        this._areFresnelDirty = true;
        this._isDirty = true;
    }
    /**
     * Marks the misc state as changed
     */
    markAsMiscDirty() {
        this._areMiscDirty = true;
        this._isDirty = true;
    }
    /**
     * Marks the prepass state as changed
     */
    markAsPrePassDirty() {
        this._arePrePassDirty = true;
        this._isDirty = true;
    }
    /**
     * Rebuilds the material defines
     */
    rebuild() {
        this._keys.length = 0;
        for (const key of Object.keys(this)) {
            if (key[0] === "_") {
                continue;
            }
            this._keys.push(key);
        }
        if (this._externalProperties) {
            for (const name in this._externalProperties) {
                if (this._keys.indexOf(name) === -1) {
                    this._keys.push(name);
                }
            }
        }
    }
    /**
     * Specifies if two material defines are equal
     * @param other - A material define instance to compare to
     * @returns - Boolean indicating if the material defines are equal (true) or not (false)
     */
    isEqual(other) {
        if (this._keys.length !== other._keys.length) {
            return false;
        }
        for (let index = 0; index < this._keys.length; index++) {
            const prop = this._keys[index];
            if (this[prop] !== other[prop]) {
                return false;
            }
        }
        return true;
    }
    /**
     * Clones this instance's defines to another instance
     * @param other - material defines to clone values to
     */
    cloneTo(other) {
        if (this._keys.length !== other._keys.length) {
            other._keys = this._keys.slice(0);
        }
        for (let index = 0; index < this._keys.length; index++) {
            const prop = this._keys[index];
            other[prop] = this[prop];
        }
    }
    /**
     * Resets the material define values
     */
    reset() {
        for (const prop of this._keys) {
            this._setDefaultValue(prop);
        }
    }
    _setDefaultValue(prop) {
        const type = this._externalProperties?.[prop]?.type ?? typeof this[prop];
        const defValue = this._externalProperties?.[prop]?.default;
        switch (type) {
            case "number":
                this[prop] = defValue ?? 0;
                break;
            case "string":
                this[prop] = defValue ?? "";
                break;
            default:
                this[prop] = defValue ?? false;
                break;
        }
    }
    /**
     * Converts the material define values to a string
     * @returns - String of material define information
     */
    toString() {
        let result = "";
        for (let index = 0; index < this._keys.length; index++) {
            const prop = this._keys[index];
            const value = this[prop];
            const type = typeof value;
            switch (type) {
                case "number":
                case "string":
                    result += "#define " + prop + " " + value + "\n";
                    break;
                default:
                    if (value) {
                        result += "#define " + prop + "\n";
                    }
                    break;
            }
        }
        return canonicalResult(result);
    }
}
// Project QA: bounded flat-literal serialization only. Custom order-sensitive
// processors are outside the verified contract; no universal API guarantee.
/** Project QA candidate derived from the accepted isolated CPU proof.
 * Input contract: a completed flat literal define block, not arbitrary shader
 * preprocessor text. No property reads, _keys changes or persistent cache.
 */
const MAX_CHARS = 32768;
const MAX_DEFINES = 1024;
// Signed decimal constants cover native -1 indices and PBR numeric strings.
// Hex/suffixes/expressions are deliberately outside this proof's contract.
const literal = '[+-]?(?:(?:0|[1-9][0-9]*)(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?';
const linePattern = new RegExp(`^#define ([A-Za-z_][A-Za-z0-9_]*)(?: (${literal}))?$`);
const reserved = new Set(['defined', 'true', 'false', 'WEBGPU', 'WEBGL1', 'WEBGL2', 'NATIVE', 'IS_NDC_HALF_ZRANGE', 'USE_REVERSE_DEPTHBUFFER', 'USE_EXACT_SRGB_CONVERSIONS', ...Object.getOwnPropertyNames(Object.prototype)]);
function canonicalResult(text) {
    if (!text || text.length > MAX_CHARS || !text.endsWith('\n') || /[^\x20-\x7e\n]/.test(text))
        return text;
    const lines = text.slice(0, -1).split('\n');
    if (lines.length > MAX_DEFINES)
        return text;
    const seen = new Set();
    for (const line of lines) {
        const match = linePattern.exec(line);
        if (!match)
            return text;
        const [, name, value] = match;
        if (name.includes('__') || name.startsWith('GL_') || reserved.has(name) || seen.has(name) || value !== undefined && !Number.isFinite(Number(value)))
            return text;
        seen.add(name);
    }
    return lines.sort().join('\n') + '\n';
}
//# sourceMappingURL=materialDefines.js.map