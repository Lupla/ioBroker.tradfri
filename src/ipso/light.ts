import { conversions, deserializers, serializers } from "../tradfri/conversions";
import { predefinedColors } from "../tradfri/predefined-colors";
import { Accessory } from "./accessory";
import { DeviceInfo } from "./deviceInfo";
import { IPSODevice } from "./ipsoDevice";
import { deserializeWith, doNotSerialize, ipsoKey, IPSOObject, PropertyTransform, required, serializeWith } from "./ipsoObject";

// see https://github.com/hreichert/smarthome/blob/master/extensions/binding/org.eclipse.smarthome.binding.tradfri/src/main/java/org/eclipse/smarthome/binding/tradfri/internal/TradfriColor.java
// for some color conversion

export class Light extends IPSODevice {

	constructor(accessory?: Accessory) {
		super();

		// get the model number to detect features
		if (accessory != null &&
			accessory.deviceInfo != null &&
			accessory.deviceInfo.modelNumber != null &&
			accessory.deviceInfo.modelNumber.length > 0
		) {
			this._modelName = accessory.deviceInfo.modelNumber;
		}
	}

	private _modelName: string;

	@ipsoKey("5706")
	@doNotSerialize // this is done through colorX / colorY
	public color: string = "f1e0b5"; // hex string

	@ipsoKey("5707")
	@serializeWith(serializers.hue)
	@deserializeWith(deserializers.hue)
	public hue: number = 0; // 0-360
	@ipsoKey("5708")
	@serializeWith(serializers.saturation)
	@deserializeWith(deserializers.saturation)
	public saturation: number = 0; // 0-100%

	@ipsoKey("5709")
	public colorX: number = 0; // int

	@ipsoKey("5710")
	public colorY: number = 0; // int

	// currently not used directly, since the gateway only accepts 3 distinct values
	// we have to set colorX to set more than those 3 color temps
	@ipsoKey("5711")
	public colorTemperature: number = 0; // TODO: CoAP range unknown!

	@ipsoKey("5712")
	@required
	@serializeWith(serializers.transitionTime)
	@deserializeWith(deserializers.transitionTime)
	public transitionTime: number = 0.5; // <float>

	@ipsoKey("5805")
	public cumulativeActivePower: number = 0.0; // <float>

	@ipsoKey("5851")
	public dimmer: number = 0; // <int> [0..254]

	@ipsoKey("5850")
	public onOff: boolean = false;

	@ipsoKey("5852")
	public onTime: number = 0; // <int>

	@ipsoKey("5820")
	public powerFactor: number = 0.0; // <float>

	@ipsoKey("5701")
	public unit: string = "";

	/**
	 * Returns true if the current lightbulb is dimmable
	 */
	public isDimmable(): boolean {
		return true; // we know no lightbulbs that aren't dimmable
	}

	/**
	 * Returns true if the current lightbulb is switchable
	 */
	public isSwitchable(): boolean {
		return true; // we know no lightbulbs that aren't switchable
	}

	public clone(): this {
		const ret = super.clone() as this;
		ret._modelName = this._modelName;
		return ret;
	}

	/**
	 * Returns the supported color spectrum of the lightbulb
	 */
	private _spectrum: Spectrum = null;
	public get spectrum(): Spectrum {
		if (this._spectrum == null) {
			// determine the spectrum
			this._spectrum = "none";
			if (this._modelName != null) {
				if (this._modelName.indexOf(" WS ") > -1) {
					// WS = white spectrum
					this._spectrum = "white";
				} else if (this._modelName.indexOf(" C/WS ") > -1 || this._modelName.indexOf(" CWS ") > -1) {
					// CWS = color + white spectrum
					this._spectrum = "rgb";
				}
			}
		}
		return this._spectrum;
	}

	/**
	 * Creates a proxy which redirects the properties to the correct internal one
	 */
	public createProxy(): this {
		switch (this.spectrum) {
			case "white": {
				const proxy = createWhiteSpectrumProxy();
				return super.createProxy(proxy.get, proxy.set);
			}
			case "rgb": {
				const proxy = createRGBProxy();
				return super.createProxy(proxy.get, proxy.set);
			}
			default:
				return this;
		}
	}

}

export type Spectrum = "none" | "white" | "rgb";

/**
 * Creates a proxy for a white spectrum lamp,
 * which converts color temperature to the correct colorX value
 */
function createWhiteSpectrumProxy<T extends Light>() {
	return {
		get: (me: T, key: PropertyKey) => {
			switch (key) {
				case "colorTemperature": {
					return conversions.whiteSpectrumFromColorX(me.colorX);
				}
				default: return me[key];
			}
		},
		set: (me: T, key: PropertyKey, value, receiver) => {
			switch (key) {
				case "colorTemperature": {
					me.colorX = conversions.whiteSpectrumToColorX(value);
					me.colorY = 27000; // magic number, but it works!
					break;
				}
				default: me[key] = value;
			}
			return true;
		},
	};
}

/**
 * Creates a proxy for an RGB lamp,
 * which converts RGB color to CIE xy
 */
function createRGBProxy<T extends Light>() {
	return {
		get: (me: T, key: PropertyKey) => {
			switch (key) {
				case "color": {
					if (typeof me.color === "string" && me.color.length === 6) {
						// predefined color, return it
						return me.color;
					} else {
						// calculate it from colorX/Y
						const {r, g, b} = conversions.rgbFromCIExy(me.colorX, me.colorY);
						return `${r.toString(16)}${g.toString(16)}${b.toString(16)}`;
					}
				}
				default: return me[key];
			}
		},
		set: (me: T, key: PropertyKey, value, receiver) => {
			switch (key) {
				case "color": {
					if (predefinedColors.has(value)) {
						// its a predefined color, use the predefined values
						const definition = predefinedColors.get(value);
						me.colorX = definition.colorX;
						me.colorY = definition.colorY;
					} else {
						// only accept HEX colors
						if (/^[0-9A-Fa-f]{6}$/.test(value)) {
							// calculate the X/Y values
							const rgb = value as string;
							const r = parseInt(rgb.substr(0, 2), 16);
							const g = parseInt(rgb.substr(2, 2), 16);
							const b = parseInt(rgb.substr(4, 2), 16);
							const {x, y} = conversions.rgbToCIExy(r, g, b);
							me.colorX = x;
							me.colorY = y;
						}
					}
					break;
				}
				default: me[key] = value;
			}
			return true;
		},
	};
}
