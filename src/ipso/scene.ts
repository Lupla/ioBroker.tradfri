import { IPSODevice } from "./ipsoDevice";
import { LightSetting } from "./lightSetting";
import { IPSOObject, ipsoKey, serializeWith, deserializeWith, PropertyTransform, required } from "./ipsoObject";

export default class Scene extends IPSODevice {

	@ipsoKey("9058")
	public isActive: boolean = false; // <bool>

	@ipsoKey("9068")
	public isPredefined: boolean = true; // <bool>

	@ipsoKey("15013")
	@deserializeWith(obj => new LightSetting().parse(obj))
	public lightSettings: LightSetting[];

	@ipsoKey("9057")
	public sceneIndex: number = 0; // <int>

	@ipsoKey("9070")
	public useCurrentLightSettings: boolean = false; // <bool>

}