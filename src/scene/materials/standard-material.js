import { Debug } from '../../core/debug.js';

import { Color } from '../../math/color.js';
import { Vec2 } from '../../math/vec2.js';
import { Quat } from '../../math/quat.js';
import { math } from '../../math/math.js';

import { _matTex2D, standard } from '../../graphics/program-lib/programs/standard.js';
import { EnvLighting } from '../../graphics/env-lighting.js';

import {
    CUBEPROJ_BOX, CUBEPROJ_NONE,
    DETAILMODE_MUL,
    FRESNEL_SCHLICK,
    SHADER_DEPTH, SHADER_PICK,
    SPECOCC_AO,
    SPECULAR_BLINN, SPECULAR_PHONG
} from '../constants.js';
import { ShaderPass } from '../shader-pass.js';
import { Material } from './material.js';
import { StandardMaterialOptionsBuilder } from './standard-material-options-builder.js';
import { ShaderProcessorOptions } from '../../graphics/shader-processor-options.js';

import { standardMaterialCubemapParameters, standardMaterialTextureParameters } from './standard-material-parameters.js';

/** @typedef {import('../../graphics/texture.js').Texture} Texture */
/** @typedef {import('../../shape/bounding-box.js').BoundingBox} BoundingBox */

// properties that get created on a standard material
const _props = {};

// special uniform functions on a standard material
const _uniforms = {};

// temporary set of params
let _params = new Set();

/**
 * Callback used by {@link StandardMaterial#onUpdateShader}.
 *
 * @callback UpdateShaderCallback
 * @param {*} options - An object with shader generator settings (based on current material and
 * scene properties), that you can change and then return. Properties of the object passed into
 * this function are documented in {@link StandardMaterial#onUpdateShader}.
 * @returns {*} Returned settings will be used by the shader.
 */

/**
 * A Standard material is the main, general purpose material that is most often used for rendering.
 * It can approximate a wide variety of surface types and can simulate dynamic reflected light.
 * Most maps can use 3 types of input values in any combination: constant (color or number), mesh
 * vertex colors and a texture. All enabled inputs are multiplied together.
 *
 * @property {Color} ambient The ambient color of the material. This color value is 3-component
 * (RGB), where each component is between 0 and 1.
 * @property {Color} diffuse The diffuse color of the material. This color value is 3-component
 * (RGB), where each component is between 0 and 1. Defines basic surface color (aka albedo).
 * @property {boolean} diffuseTint Multiply main (primary) diffuse map and/or diffuse vertex color
 * by the constant diffuse value.
 * @property {Texture|null} diffuseMap The main (primary) diffuse map of the material (default is
 * null).
 * @property {number} diffuseMapUv Main (primary) diffuse map UV channel.
 * @property {Vec2} diffuseMapTiling Controls the 2D tiling of the main (primary) diffuse map.
 * @property {Vec2} diffuseMapOffset Controls the 2D offset of the main (primary) diffuse map. Each
 * component is between 0 and 1.
 * @property {number} diffuseMapRotation Controls the 2D rotation (in degrees) of the main
 * (primary) diffuse map.
 * @property {string} diffuseMapChannel Color channels of the main (primary) diffuse map to use.
 * Can be "r", "g", "b", "a", "rgb" or any swizzled combination.
 * @property {boolean} diffuseVertexColor Use mesh vertex colors for diffuse. If diffuseMap or are
 * diffuseTint are set, they'll be multiplied by vertex colors.
 * @property {string} diffuseVertexColorChannel Vertex color channels to use for diffuse. Can be
 * "r", "g", "b", "a", "rgb" or any swizzled combination.
 * @property {Texture|null} diffuseDetailMap The detail (secondary) diffuse map of the material
 * (default is null). Will only be used if main (primary) diffuse map is non-null.
 * @property {number} diffuseDetailMapUv Detail (secondary) diffuse map UV channel.
 * @property {Vec2} diffuseDetailMapTiling Controls the 2D tiling of the detail (secondary) diffuse
 * map.
 * @property {Vec2} diffuseDetailMapOffset Controls the 2D offset of the detail (secondary) diffuse
 * map. Each component is between 0 and 1.
 * @property {number} diffuseDetailMapRotation Controls the 2D rotation (in degrees) of the main
 * (secondary) diffuse map.
 * @property {string} diffuseDetailMapChannel Color channels of the detail (secondary) diffuse map
 * to use. Can be "r", "g", "b", "a", "rgb" or any swizzled combination.
 * @property {string} diffuseDetailMode Determines how the main (primary) and detail (secondary)
 * diffuse maps are blended together. Can be:
 *
 * - {@link DETAILMODE_MUL}: Multiply together the primary and secondary colors.
 * - {@link DETAILMODE_ADD}: Add together the primary and secondary colors.
 * - {@link DETAILMODE_SCREEN}: Softer version of {@link DETAILMODE_ADD}.
 * - {@link DETAILMODE_OVERLAY}: Multiplies or screens the colors, depending on the primary color.
 * - {@link DETAILMODE_MIN}: Select whichever of the primary and secondary colors is darker,
 * component-wise.
 * - {@link DETAILMODE_MAX}: Select whichever of the primary and secondary colors is lighter,
 * component-wise.
 *
 * Defaults to {@link DETAILMODE_MUL}.
 * @property {Color} specular The specular color of the material. This color value is 3-component
 * (RGB), where each component is between 0 and 1. Defines surface reflection/specular color.
 * Affects specular intensity and tint.
 * @property {boolean} specularTint Multiply specular map and/or specular vertex color by the
 * constant specular value.
 * @property {Texture|null} specularMap The specular map of the material (default is null).
 * @property {number} specularMapUv Specular map UV channel.
 * @property {Vec2} specularMapTiling Controls the 2D tiling of the specular map.
 * @property {Vec2} specularMapOffset Controls the 2D offset of the specular map. Each component is
 * between 0 and 1.
 * @property {number} specularMapRotation Controls the 2D rotation (in degrees) of the specular map.
 * @property {string} specularMapChannel Color channels of the specular map to use. Can be "r", "g",
 * "b", "a", "rgb" or any swizzled combination.
 * @property {boolean} specularVertexColor Use mesh vertex colors for specular. If specularMap or
 * are specularTint are set, they'll be multiplied by vertex colors.
 * @property {string} specularVertexColorChannel Vertex color channels to use for specular. Can be
 * @property {boolean} specularityFactorTint Multiply specularity factor map and/or specular vertex color by the
 * constant specular value.
 * "r", "g", "b", "a", "rgb" or any swizzled combination.
 * @property {number} specularityFactor The factor of specular intensity, used to weight the fresnel and specularity. Default is 1.0.
 * @property {Texture|null} specularityFactorMap The factor of specularity as a texture (default is null).
 * @property {number} specularityFactorMapUv Specularity factor map UV channel.
 * @property {Vec2} specularityFactorMapTiling Controls the 2D tiling of the specularity factor map.
 * @property {Vec2} specularityFactorMapOffset Controls the 2D offset of the specularity factor map. Each component is
 * between 0 and 1.
 * @property {number} specularityFactorMapRotation Controls the 2D rotation (in degrees) of the specularity factor map.
 * @property {string} specularityFactorMapChannel The channel used by the specularity factor texture to sample from (default is 'a').
 * @property {boolean} specularityFactorVertexColor Use mesh vertex colors for specularity factor. If specularityFactorMap or
 * are specularityFactorTint are set, they'll be multiplied by vertex colors.
 * @property {string} specularityFactorVertexColorChannel Vertex color channels to use for specularity factor. Can be
 * "r", "g", "b", "a", "rgb" or any swizzled combination.
 * @property {boolean} enableGGXSpecular Enables GGX specular. Also enables
 * {@link StandardMaterial#anisotropy}  parameter to set material anisotropy.
 * @property {number} anisotropy Defines amount of anisotropy. Requires
 * {@link StandardMaterial#enableGGXSpecular} is set to true.
 *
 * - When anisotropy == 0, specular is isotropic.
 * - When anisotropy < 0, anisotropy direction aligns with the tangent, and specular anisotropy
 * increases as the anisotropy value decreases to minimum of -1.
 * - When anisotropy > 0, anisotropy direction aligns with the bi-normal, and specular anisotropy
 * increases as anisotropy value increases to maximum of 1.
 *
 * @property {number} clearCoat Defines intensity of clear coat layer from 0 to 1. Clear coat layer
 * is disabled when clearCoat == 0. Default value is 0 (disabled).
 * @property {Texture|null} clearCoatMap Monochrome clear coat intensity map (default is null). If
 * specified, will be multiplied by normalized 'clearCoat' value and/or vertex colors.
 * @property {number} clearCoatMapUv Clear coat intensity map UV channel.
 * @property {Vec2} clearCoatMapTiling Controls the 2D tiling of the clear coat intensity map.
 * @property {Vec2} clearCoatMapOffset Controls the 2D offset of the clear coat intensity map. Each
 * component is between 0 and 1.
 * @property {number} clearCoatMapRotation Controls the 2D rotation (in degrees) of the clear coat
 * intensity map.
 * @property {string} clearCoatMapChannel Color channel of the clear coat intensity map to use. Can
 * be "r", "g", "b" or "a".
 * @property {boolean} clearCoatVertexColor Use mesh vertex colors for clear coat intensity. If
 * clearCoatMap is set, it'll be multiplied by vertex colors.
 * @property {string} clearCoatVertexColorChannel Vertex color channel to use for clear coat
 * intensity. Can be "r", "g", "b" or "a".
 * @property {number} clearCoatGlossiness Defines the clear coat glossiness of the clear coat layer
 * from 0 (rough) to 1 (mirror).
 * @property {Texture|null} clearCoatGlossMap Monochrome clear coat glossiness map (default is
 * null). If specified, will be multiplied by normalized 'clearCoatGlossiness' value and/or vertex
 * colors.
 * @property {number} clearCoatGlossMapUv Clear coat gloss map UV channel.
 * @property {Vec2} clearCoatGlossMapTiling Controls the 2D tiling of the clear coat gloss map.
 * @property {Vec2} clearCoatGlossMapOffset Controls the 2D offset of the clear coat gloss map.
 * Each component is between 0 and 1.
 * @property {number} clearCoatGlossMapRotation Controls the 2D rotation (in degrees) of the clear
 * coat gloss map.
 * @property {string} clearCoatGlossMapChannel Color channel of the clear coat gloss map to use.
 * Can be "r", "g", "b" or "a".
 * @property {boolean} clearCoatGlossVertexColor Use mesh vertex colors for clear coat glossiness.
 * If clearCoatGlossMap is set, it'll be multiplied by vertex colors.
 * @property {string} clearCoatGlossVertexColorChannel Vertex color channel to use for clear coat
 * glossiness. Can be "r", "g", "b" or "a".
 * @property {Texture|null} clearCoatNormalMap The clear coat normal map of the material (default
 * is null). The texture must contains normalized, tangent space normals.
 * @property {number} clearCoatNormalMapUv Clear coat normal map UV channel.
 * @property {Vec2} clearCoatNormalMapTiling Controls the 2D tiling of the main clear coat normal
 * map.
 * @property {Vec2} clearCoatNormalMapOffset Controls the 2D offset of the main clear coat normal
 * map. Each component is between 0 and 1.
 * @property {number} clearCoatNormalMapRotation Controls the 2D rotation (in degrees) of the main
 * clear coat map.
 * @property {number} clearCoatBumpiness The bumpiness of the clear coat layer. This value scales
 * the assigned main clear coat normal map. It should be normally between 0 (no bump mapping) and 1
 * (full bump mapping), but can be set to e.g. 2 to give even more pronounced bump effect.
 * @property {boolean} useMetalness Use metalness properties instead of specular. When enabled,
 * diffuse colors also affect specular instead of the dedicated specular map. This can be used as
 * alternative to specular color to save space. With metaless == 0, the pixel is assumed to be
 * dielectric, and diffuse color is used as normal. With metaless == 1, the pixel is fully
 * metallic, and diffuse color is used as specular color instead.
 * @property {boolean} useMetalnessSpecularColor When metalness is enabled, use the specular map to apply color tint to specular reflections
 * at direct angles.
 * @property {number} metalness Defines how much the surface is metallic. From 0 (dielectric) to 1
 * (metal).
 * @property {Texture|null} metalnessMap Monochrome metalness map (default is null).
 * @property {number} metalnessMapUv Metalness map UV channel.
 * @property {Vec2} metalnessMapTiling Controls the 2D tiling of the metalness map.
 * @property {Vec2} metalnessMapOffset Controls the 2D offset of the metalness map. Each component
 * is between 0 and 1.
 * @property {number} metalnessMapRotation Controls the 2D rotation (in degrees) of the metalness
 * map.
 * @property {string} metalnessMapChannel Color channel of the metalness map to use. Can be "r",
 * "g", "b" or "a".
 * @property {boolean} metalnessVertexColor Use mesh vertex colors for metalness. If metalnessMap
 * is set, it'll be multiplied by vertex colors.
 * @property {string} metalnessVertexColorChannel Vertex color channel to use for metalness. Can be
 * "r", "g", "b" or "a".
 * @property {number} shininess Defines glossiness of the material from 0 (rough) to 100 (shiny
 * mirror). A higher shininess value results in a more focused specular highlight. Glossiness map/
 * vertex colors are always multiplied by this value (normalized to 0 - 1 range), or it is used
 * directly as constant output.
 * @property {Texture|null} glossMap Glossiness map (default is null). If specified, will be
 * multiplied by normalized 'shininess' value and/or vertex colors.
 * @property {number} glossMapUv Gloss map UV channel.
 * @property {string} glossMapChannel Color channel of the gloss map to use. Can be "r", "g", "b"
 * or "a".
 * @property {Vec2} glossMapTiling Controls the 2D tiling of the gloss map.
 * @property {Vec2} glossMapOffset Controls the 2D offset of the gloss map. Each component is
 * between 0 and 1.
 * @property {number} glossMapRotation Controls the 2D rotation (in degrees) of the gloss map.
 * @property {boolean} glossVertexColor Use mesh vertex colors for glossiness. If glossMap is set,
 * it'll be multiplied by vertex colors.
 * @property {string} glossVertexColorChannel Vertex color channel to use for glossiness. Can be
 * "r", "g", "b" or "a".
 * @property {number} refraction Defines the visibility of refraction. Material can refract the
 * same cube map as used for reflections.
 * @property {Texture|null} refractionMap The map of the refraction visibility.
 * @property {number} refractionMapUv Refraction map UV channel.
 * @property {Vec2} refractionMapTiling Controls the 2D tiling of the refraction map.
 * @property {Vec2} refractionMapOffset Controls the 2D offset of the refraction map. Each component is
 * between 0 and 1.
 * @property {number} refractionMapRotation Controls the 2D rotation (in degrees) of the emissive
 * map.
 * @property {string} refractionMapChannel Color channels of the refraction map to use. Can be "r",
 * "g", "b", "a", "rgb" or any swizzled combination.
 * @property {number} refractionIndex Defines the index of refraction, i.e. The amount of
 * distortion. The value is calculated as (outerIor / surfaceIor), where inputs are measured
 * indices of refraction, the one around the object and the one of its own surface. In most
 * situations outer medium is air, so outerIor will be approximately 1. Then you only need to do
 * (1.0 / surfaceIor).
 * @property {boolean} useDynamicRefraction Enables higher quality refractions using the grab pass
 * instead of pre-computed cube maps for refractions.
 * @property {Color} emissive The emissive color of the material. This color value is 3-component
 * (RGB), where each component is between 0 and 1.
 * @property {boolean} emissiveTint Multiply emissive map and/or emissive vertex color by the
 * constant emissive value.
 * @property {Texture|null} emissiveMap The emissive map of the material (default is null). Can be
 * HDR.
 * @property {number} emissiveIntensity Emissive color multiplier.
 * @property {number} emissiveMapUv Emissive map UV channel.
 * @property {Vec2} emissiveMapTiling Controls the 2D tiling of the emissive map.
 * @property {Vec2} emissiveMapOffset Controls the 2D offset of the emissive map. Each component is
 * between 0 and 1.
 * @property {number} emissiveMapRotation Controls the 2D rotation (in degrees) of the emissive
 * map.
 * @property {string} emissiveMapChannel Color channels of the emissive map to use. Can be "r",
 * "g", "b", "a", "rgb" or any swizzled combination.
 * @property {boolean} emissiveVertexColor Use mesh vertex colors for emission. If emissiveMap or
 * emissiveTint are set, they'll be multiplied by vertex colors.
 * @property {string} emissiveVertexColorChannel Vertex color channels to use for emission. Can be
 * "r", "g", "b", "a", "rgb" or any swizzled combination.
 * @property {boolean} useSheen Toggle sheen specular effect on/off.
 * @property {Color} sheen The specular color of the sheen (fabric) microfiber structure. This color value is 3-component
 * (RGB), where each component is between 0 and 1.
 * @property {boolean} sheenTint Multiply sheen map and/or sheen vertex color by the constant sheen value.
 * @property {Texture|null} sheenMap The sheen microstructure color map of the material (default is null).
 * @property {number} sheenMapUv Sheen map UV channel.
 * @property {Vec2} sheenMapTiling Controls the 2D tiling of the sheen map.
 * @property {Vec2} sheenMapOffset Controls the 2D offset of the sheen map. Each component is
 * between 0 and 1.
 * @property {number} sheenMapRotation Controls the 2D rotation (in degrees) of the sheen
 * map.
 * @property {string} sheenMapChannel Color channels of the sheen map to use. Can be "r",
 * "g", "b", "a", "rgb" or any swizzled combination.
 * @property {number} sheenGlossiness The glossiness of the sheen (fabric) microfiber structure. This color value is 3-component
 * (RGB), where each component is between 0 and 1.
 * @property {boolean} sheenGlossinessTint Multiply sheen glossiness map and/or sheen glossiness vertex value by the scalar sheen glossiness value.
 * @property {Texture|null} sheenGlossinessMap The sheen glossiness microstructure color map of the material (default is null).
 * @property {number} sheenGlossinessMapUv Sheen map UV channel.
 * @property {Vec2} sheenGlossinessMapTiling Controls the 2D tiling of the sheen glossiness map.
 * @property {Vec2} sheenGlossinessMapOffset Controls the 2D offset of the sheen glossiness map. Each component is
 * between 0 and 1.
 * @property {number} sheenGlossinessMapRotation Controls the 2D rotation (in degrees) of the sheen glossiness
 * map.
 * @property {string} sheenGlossinessMapChannel Color channels of the sheen glossiness map to use. Can be "r",
 * "g", "b", "a", "rgb" or any swizzled combination.
 * @property {number} opacity The opacity of the material. This value can be between 0 and 1, where
 * 0 is fully transparent and 1 is fully opaque. If you want the material to be semi-transparent
 * you also need to set the {@link Material#blendType} to {@link BLEND_NORMAL},
 * {@link BLEND_ADDITIVE} or any other mode. Also note that for most semi-transparent objects you
 * want {@link Material#depthWrite} to be false, otherwise they can fully occlude objects behind
 * them.
 * @property {Texture|null} opacityMap The opacity map of the material (default is null).
 * @property {number} opacityMapUv Opacity map UV channel.
 * @property {string} opacityMapChannel Color channel of the opacity map to use. Can be "r", "g",
 * "b" or "a".
 * @property {Vec2} opacityMapTiling Controls the 2D tiling of the opacity map.
 * @property {Vec2} opacityMapOffset Controls the 2D offset of the opacity map. Each component is
 * between 0 and 1.
 * @property {number} opacityMapRotation Controls the 2D rotation (in degrees) of the opacity map.
 * @property {boolean} opacityVertexColor Use mesh vertex colors for opacity. If opacityMap is set,
 * it'll be multiplied by vertex colors.
 * @property {string} opacityVertexColorChannel Vertex color channels to use for opacity. Can be
 * "r", "g", "b" or "a".
 * @property {boolean} opacityFadesSpecular used to specify whether specular and reflections are
 * faded out using {@link StandardMaterial#opacity}. Default is true. When set to false use
 * {@link Material#alphaFade} to fade out materials.
 * @property {number} alphaFade used to fade out materials when
 * {@link StandardMaterial#opacityFadesSpecular} is set to false.
 * @property {Texture|null} normalMap The main (primary) normal map of the material (default is
 * null). The texture must contains normalized, tangent space normals.
 * @property {number} normalMapUv Main (primary) normal map UV channel.
 * @property {Vec2} normalMapTiling Controls the 2D tiling of the main (primary) normal map.
 * @property {Vec2} normalMapOffset Controls the 2D offset of the main (primary) normal map. Each
 * component is between 0 and 1.
 * @property {number} normalMapRotation Controls the 2D rotation (in degrees) of the main (primary)
 * normal map.
 * @property {number} bumpiness The bumpiness of the material. This value scales the assigned main
 * (primary) normal map. It should be normally between 0 (no bump mapping) and 1 (full bump
 * mapping), but can be set to e.g. 2 to give even more pronounced bump effect.
 * @property {Texture|null} normalDetailMap The detail (secondary) normal map of the material
 * (default is null). Will only be used if main (primary) normal map is non-null.
 * @property {number} normalDetailMapUv Detail (secondary) normal map UV channel.
 * @property {Vec2} normalDetailMapTiling Controls the 2D tiling of the detail (secondary) normal
 * map.
 * @property {Vec2} normalDetailMapOffset Controls the 2D offset of the detail (secondary) normal
 * map. Each component is between 0 and 1.
 * @property {number} normalDetailMapRotation Controls the 2D rotation (in degrees) of the detail
 * (secondary) normal map.
 * @property {number} normalDetailMapBumpiness The bumpiness of the material. This value scales the
 * assigned detail (secondary) normal map. It should be normally between 0 (no bump mapping) and 1
 * (full bump mapping), but can be set to e.g. 2 to give even more pronounced bump effect.
 * @property {Texture|null} heightMap The height map of the material (default is null). Used for a
 * view-dependent parallax effect. The texture must represent the height of the surface where
 * darker pixels are lower and lighter pixels are higher. It is recommended to use it together with
 * a normal map.
 * @property {number} heightMapUv Height map UV channel.
 * @property {string} heightMapChannel Color channel of the height map to use. Can be "r", "g", "b"
 * or "a".
 * @property {Vec2} heightMapTiling Controls the 2D tiling of the height map.
 * @property {Vec2} heightMapOffset Controls the 2D offset of the height map. Each component is
 * between 0 and 1.
 * @property {number} heightMapRotation Controls the 2D rotation (in degrees) of the height map.
 * @property {number} heightMapFactor Height map multiplier. Affects the strength of the parallax
 * effect.
 * @property {Texture|null} envAtlas The prefiltered environment lighting atlas (default is null).
 * This setting overrides cubeMap and sphereMap and will replace the scene lighting environment.
 * @property {Texture|null} cubeMap The cubic environment map of the material (default is null).
 * This setting overrides sphereMap and will replace the scene lighting environment.
 * @property {Texture|null} sphereMap The spherical environment map of the material (default is
 * null). This will replace the scene lighting environment.
 * @property {number} cubeMapProjection The type of projection applied to the cubeMap property:
 * - {@link CUBEPROJ_NONE}: The cube map is treated as if it is infinitely far away.
 * - {@link CUBEPROJ_BOX}: Box-projection based on a world space axis-aligned bounding box.
 * Defaults to {@link CUBEPROJ_NONE}.
 * @property {BoundingBox} cubeMapProjectionBox The world space axis-aligned bounding box defining
 * the box-projection used for the cubeMap property. Only used when cubeMapProjection is set to
 * {@link CUBEPROJ_BOX}.
 * @property {number} reflectivity Environment map intensity.
 * @property {Texture|null} lightMap A custom lightmap of the material (default is null). Lightmaps
 * are textures that contain pre-rendered lighting. Can be HDR.
 * @property {number} lightMapUv Lightmap UV channel
 * @property {string} lightMapChannel Color channels of the lightmap to use. Can be "r", "g", "b",
 * "a", "rgb" or any swizzled combination.
 * @property {Vec2} lightMapTiling Controls the 2D tiling of the lightmap.
 * @property {Vec2} lightMapOffset Controls the 2D offset of the lightmap. Each component is
 * between 0 and 1.
 * @property {number} lightMapRotation Controls the 2D rotation (in degrees) of the lightmap.
 * @property {boolean} lightVertexColor Use baked vertex lighting. If lightMap is set, it'll be
 * multiplied by vertex colors.
 * @property {string} lightVertexColorChannel Vertex color channels to use for baked lighting. Can
 * be "r", "g", "b", "a", "rgb" or any swizzled combination.
 * @property {boolean} ambientTint Enables scene ambient multiplication by material ambient color.
 * @property {Texture|null} aoMap Baked ambient occlusion (AO) map (default is null). Modulates
 * ambient color.
 * @property {number} aoMapUv AO map UV channel
 * @property {string} aoMapChannel Color channel of the AO map to use. Can be "r", "g", "b" or "a".
 * @property {Vec2} aoMapTiling Controls the 2D tiling of the AO map.
 * @property {Vec2} aoMapOffset Controls the 2D offset of the AO map. Each component is between 0
 * and 1.
 * @property {number} aoMapRotation Controls the 2D rotation (in degrees) of the AO map.
 * @property {boolean} aoVertexColor Use mesh vertex colors for AO. If aoMap is set, it'll be
 * multiplied by vertex colors.
 * @property {string} aoVertexColorChannel Vertex color channels to use for AO. Can be "r", "g",
 * "b" or "a".
 * @property {number} occludeSpecular Uses ambient occlusion to darken specular/reflection. It's a
 * hack, because real specular occlusion is view-dependent. However, it can be better than nothing.
 *
 * - {@link SPECOCC_NONE}: No specular occlusion
 * - {@link SPECOCC_AO}: Use AO directly to occlude specular.
 * - {@link SPECOCC_GLOSSDEPENDENT}: Modify AO based on material glossiness/view angle to occlude
 * specular.
 *
 * @property {number} occludeSpecularIntensity Controls visibility of specular occlusion.
 * @property {boolean} occludeDirect Tells if AO should darken directional lighting. Defaults to
 * false.
 * @property {boolean} conserveEnergy Defines how diffuse and specular components are combined when
 * Fresnel is on. It is recommended that you leave this option enabled, although you may want to
 * disable it in case when all reflection comes only from a few light sources, and you don't use an
 * environment map, therefore having mostly black reflection.
 * @property {number} shadingModel Defines the shading model.
 * - {@link SPECULAR_PHONG}: Phong without energy conservation. You should only use it as a
 * backwards compatibility with older projects.
 * - {@link SPECULAR_BLINN}: Energy-conserving Blinn-Phong.
 * @property {number} fresnelModel Defines the formula used for Fresnel effect.
 * As a side-effect, enabling any Fresnel model changes the way diffuse and reflection components
 * are combined. When Fresnel is off, legacy non energy-conserving combining is used. When it is
 * on, combining behavior is defined by conserveEnergy parameter.
 *
 * - {@link FRESNEL_NONE}: No Fresnel.
 * - {@link FRESNEL_SCHLICK}: Schlick's approximation of Fresnel (recommended). Parameterized by
 * specular color.
 *
 * @property {boolean} useFog Apply fogging (as configured in scene settings)
 * @property {boolean} useLighting Apply lighting
 * @property {boolean} useSkybox Apply scene skybox as prefiltered environment map
 * @property {boolean} useGammaTonemap Apply gamma correction and tonemapping (as configured in
 * scene settings).
 * @property {boolean} pixelSnap Align vertices to pixel coordinates when rendering. Useful for
 * pixel perfect 2D graphics.
 * @property {boolean} twoSidedLighting Calculate proper normals (and therefore lighting) on
 * backfaces.
 * @property {UpdateShaderCallback} onUpdateShader A custom function that will be called after all
 * shader generator properties are collected and before shader code is generated. This function
 * will receive an object with shader generator settings (based on current material and scene
 * properties), that you can change and then return. Returned value will be used instead. This is
 * mostly useful when rendering the same set of objects, but with different shader variations based
 * on the same material. For example, you may wish to render a depth or normal pass using textures
 * assigned to the material, a reflection pass with simpler shaders and so on. Properties of the
 * object passed into this function are:
 *
 * - pass: value of {@link Layer#shaderPass} of the Layer being rendered.
 * - chunks: Object containing custom shader chunks that will replace default ones.
 * - customFragmentShader: Completely replace fragment shader with this code.
 * - forceUv1: if UV1 (second set of texture coordinates) is required in the shader. Will be
 * declared as "vUv1" and passed to the fragment shader.
 * - fog: the type of fog being applied in the shader. See {@link Scene#fog} for the list of
 * possible values.
 * - gamma: the type of gamma correction being applied in the shader. See
 * {@link Scene#gammaCorrection} for the list of possible values.
 * - toneMap: the type of tone mapping being applied in the shader. See {@link Scene#toneMapping}
 * for the list of possible values.
 * - ambientTint: the value of {@link StandardMaterial#ambientTint}.
 * - conserveEnergy: the value of {@link StandardMaterial#conserveEnergy}.
 * - occludeSpecular: the value of {@link StandardMaterial#occludeSpecular}.
 * - occludeDirect: the value of {@link StandardMaterial#occludeDirect}.
 * - shadingModel: the value of {@link StandardMaterial#shadingModel}.
 * - fresnelModel: the value of {@link StandardMaterial#fresnelModel}.
 * - cubeMapProjection: the value of {@link StandardMaterial#cubeMapProjection}.
 * - useMetalness: the value of {@link StandardMaterial#useMetalness}.
 * - blendType: the value of {@link Material#blendType}.
 * - twoSidedLighting: the value of {@link Material#twoSidedLighting}.
 * - diffuseTint: defines if {@link StandardMaterial#diffuse} constant should affect diffuse color.
 * - specularTint: defines if {@link StandardMaterial#specular} constant should affect specular
 * color.
 * - metalnessTint: defines if {@link StandardMaterial#metalness} constant should affect metalness
 * value.
 * - glossTint: defines if {@link StandardMaterial#shininess} constant should affect glossiness
 * value.
 * - emissiveTint: defines if {@link StandardMaterial#emissive} constant should affect emission
 * value.
 * - opacityTint: defines if {@link StandardMaterial#opacity} constant should affect opacity value.
 * - occludeSpecularFloat: defines if {@link StandardMaterial#occludeSpecularIntensity} constant
 * should affect specular occlusion.
 * - alphaTest: enable alpha testing. See {@link Material#alphaTest}.
 * - alphaToCoverage: enable alpha to coverage. See {@link Material#alphaToCoverage}.
 * - opacityFadesSpecular: enable specular fade. See {@link Material#opacityFadesSpecular}.
 * - alphaFade: fade value. See {@link Material#alphaFade}.
 * - sphereMap: if {@link StandardMaterial#sphereMap} is used.
 * - cubeMap: if {@link StandardMaterial#cubeMap} is used.
 * - ambientSH: if ambient spherical harmonics are used. Ambient SH replace prefiltered cubemap
 * ambient on certain platform (mostly Android) for performance reasons.
 * - useSpecular: if any specular or reflections are needed at all.
 * - fixSeams: if cubemaps require seam fixing (see {@link Texture#options.fixCubemapSeams}).
 * - emissiveEncoding: how emissiveMap is encoded. This value is based on Texture#encoding.
 * - lightMapEncoding: how lightMap is encoded. This value is based on on Texture#encoding.
 * - packedNormal: if normal map contains X in RGB, Y in Alpha, and Z must be reconstructed.
 * - forceFragmentPrecision: Override fragment shader numeric precision. Can be "lowp", "mediump",
 * "highp" or null to use default.
 * - fastTbn: Use slightly cheaper normal mapping code (skip tangent space normalization). Can look
 * buggy sometimes.
 * - refraction: if refraction is used.
 * - skyboxIntensity: if reflected skybox intensity should be modulated.
 * - useCubeMapRotation: if cube map rotation is enabled.
 * - useInstancing: if hardware instancing compatible shader should be generated. Transform is read
 * from per-instance {@link VertexBuffer} instead of shader's uniforms.
 * - useMorphPosition: if morphing code should be generated to morph positions.
 * - useMorphNormal: if morphing code should be generated to morph normals.
 * - reflectionSource: one of "envAtlasHQ", "envAtlas", "cubeMap", "sphereMap"
 * - reflectionEncoding: one of null, "rgbm", "rgbe", "linear", "srgb"
 * - ambientSource: one of "ambientSH", "envAtlas", "constant"
 * - ambientEncoding: one of null, "rgbm", "rgbe", "linear", "srgb"
 * @augments Material
 */
class StandardMaterial extends Material {
    static TEXTURE_PARAMETERS = standardMaterialTextureParameters;

    static CUBEMAP_PARAMETERS = standardMaterialCubemapParameters;

    /**
     * Create a new StandardMaterial instance.
     *
     * @example
     * // Create a new Standard material
     * var material = new pc.StandardMaterial();
     *
     * // Update the material's diffuse and specular properties
     * material.diffuse.set(1, 0, 0);
     * material.specular.set(1, 1, 1);
     *
     * // Notify the material that it has been modified
     * material.update();
     * @example
     * // Create a new Standard material
     * var material = new pc.StandardMaterial();
     *
     * // Assign a texture to the diffuse slot
     * material.diffuseMap = texture;
     *
     * // Use the alpha channel of the texture for alpha testing with a reference value of 0.5
     * material.opacityMap = texture;
     * material.alphaTest = 0.5;
     *
     * // Notify the material that it has been modified
     * material.update();
     */
    constructor() {
        super();

        this._dirtyShader = true;

        // storage for texture and cubemap asset references
        this._assetReferences = {};

        this._activeParams = new Set();
        this._activeLightingParams = new Set();

        this.shaderOptBuilder = new StandardMaterialOptionsBuilder();

        this.reset();
    }

    reset() {
        // set default values
        Object.keys(_props).forEach((name) => {
            this[`_${name}`] = _props[name].value();
        });

        /**
         * @type {Object<string, string>}
         * @private
         */
        this._chunks = { };
        this._uniformCache = { };
    }

    set shader(shader) {
        Debug.warn('StandardMaterial#shader property is not implemented, and should not be used.');
    }

    get shader() {
        Debug.warn('StandardMaterial#shader property is not implemented, and should not be used.');
        return null;
    }

    /**
     * Object containing custom shader chunks that will replace default ones.
     *
     * @type {Object<string, string>}
     */
    set chunks(value) {
        this._dirtyShader = true;
        this._chunks = value;
    }

    get chunks() {
        this._dirtyShader = true;
        return this._chunks;
    }

    /**
     * Copy a `StandardMaterial`.
     *
     * @param {StandardMaterial} source - The material to copy from.
     * @returns {StandardMaterial} The destination material.
     */
    copy(source) {
        super.copy(source);

        // set properties
        Object.keys(_props).forEach((k) => {
            this[k] = source[k];
        });

        // clone chunks
        for (const p in source._chunks) {
            if (source._chunks.hasOwnProperty(p))
                this._chunks[p] = source._chunks[p];
        }

        return this;
    }

    _setParameter(name, value) {
        _params.add(name);
        this.setParameter(name, value);
    }

    _setParameters(parameters) {
        parameters.forEach((v) => {
            this._setParameter(v.name, v.value);
        });
    }

    _processParameters(paramsName) {
        const prevParams = this[paramsName];
        prevParams.forEach((param) => {
            if (!_params.has(param)) {
                delete this.parameters[param];
            }
        });

        this[paramsName] = _params;
        _params = prevParams;
        _params.clear();
    }

    _updateMap(p) {
        const mname = p + 'Map';
        const map = this[mname];
        if (map) {
            this._setParameter('texture_' + mname, map);

            const tname = mname + 'Transform';
            const uniform = this.getUniform(tname);
            if (uniform) {
                this._setParameters(uniform);
            }
        }
    }

    // allocate a uniform if it doesn't already exist in the uniform cache
    _allocUniform(name, allocFunc) {
        let uniform = this._uniformCache[name];
        if (!uniform) {
            uniform = allocFunc();
            this._uniformCache[name] = uniform;
        }
        return uniform;
    }

    getUniform(name, device, scene) {
        return _uniforms[name](this, device, scene);
    }

    updateUniforms(device, scene) {
        const getUniform = (name) => {
            return this.getUniform(name, device, scene);
        };

        this._setParameter('material_ambient', getUniform('ambient'));

        if (!this.diffuseMap || this.diffuseTint) {
            this._setParameter('material_diffuse', getUniform('diffuse'));
        }

        if (!this.useMetalness) {
            if (!this.specularMap || this.specularTint) {
                this._setParameter('material_specular', getUniform('specular'));
            }
        } else {
            if (!this.metalnessMap || this.metalness < 1) {
                this._setParameter('material_metalness', this.metalness);
            }
            if (!this.specularMap || this.specularTint) {
                this._setParameter('material_specular', getUniform('specular'));
            }
            if (!this.specularityFactorMap || this.specularityFactorTint) {
                this._setParameter('material_specularityFactor', this.specularityFactor);
            }
            if (!this.sheenMap || this.sheenTint) {
                this._setParameter('material_sheen', getUniform('sheen'));
            }
            if (!this.sheenGlossinessMap || this.sheenGlossinessTint) {
                this._setParameter('material_sheenGlossiness', this.sheenGlossiness);
            }

            if (this.refractionIndex > 0.0) {
                const oneOverRefractionIndex = 1.0 / this.refractionIndex;
                const f0 = (oneOverRefractionIndex - 1) / (oneOverRefractionIndex + 1);
                this._setParameter('material_f0', f0 * f0);
            } else {
                this._setParameter('material_f0', 1.0);
            }

        }

        if (this.enableGGXSpecular) {
            this._setParameter('material_anisotropy', this.anisotropy);
        }

        if (this.clearCoat > 0) {
            this._setParameter('material_clearCoat', this.clearCoat);
            this._setParameter('material_clearCoatGlossiness', this.clearCoatGlossiness);
            this._setParameter('material_clearCoatReflectivity', this.clearCoat); // for now don't separate this
            this._setParameter('material_clearCoatBumpiness', this.clearCoatBumpiness);
        }

        this._setParameter('material_shininess', getUniform('shininess'));

        if (!this.emissiveMap || this.emissiveTint) {
            this._setParameter('material_emissive', getUniform('emissive'));
        }
        if (this.emissiveIntensity !== 1) {
            this._setParameter('material_emissiveIntensity', this.emissiveIntensity);
        }

        if (this.refraction > 0) {
            this._setParameter('material_refraction', this.refraction);
            this._setParameter('material_refractionIndex', this.refractionIndex);
        }

        if (this.useDynamicRefraction) {
            this._setParameter('material_thickness', this.thickness);
            this._setParameter('material_attenuation', getUniform('attenuation'));
            this._setParameter('material_invAttenuationDistance', this.attenuationDistance === 0 ? 0 : 1.0 / this.attenuationDistance);
        }

        if (this.useIridescence) {
            this._setParameter('material_iridescence', this.iridescence);
            this._setParameter('material_iridescenceRefractionIndex', this.iridescenceRefractionIndex);
            this._setParameter('material_iridescenceThicknessMin', this.iridescenceThicknessMin);
            this._setParameter('material_iridescenceThicknessMax', this.iridescenceThicknessMax);
        }

        this._setParameter('material_opacity', this.opacity);

        if (this.opacityFadesSpecular === false) {
            this._setParameter('material_alphaFade', this.alphaFade);
        }

        if (this.occludeSpecular) {
            this._setParameter('material_occludeSpecularIntensity', this.occludeSpecularIntensity);
        }

        if (this.cubeMapProjection === CUBEPROJ_BOX) {
            this._setParameter(getUniform('cubeMapProjectionBox'));
        }

        for (const p in _matTex2D) {
            this._updateMap(p);
        }

        if (this.ambientSH) {
            this._setParameter('ambientSH[0]', this.ambientSH);
        }

        if (this.normalMap) {
            this._setParameter('material_bumpiness', this.bumpiness);
        }

        if (this.normalMap && this.normalDetailMap) {
            this._setParameter('material_normalDetailMapBumpiness', this.normalDetailMapBumpiness);
        }

        if (this.heightMap) {
            this._setParameter('material_heightMapFactor', getUniform('heightMapFactor'));
        }

        const isPhong = this.shadingModel === SPECULAR_PHONG;

        // set overridden environment textures
        if (this.envAtlas && this.cubeMap && !isPhong) {
            this._setParameter('texture_envAtlas', this.envAtlas);
            this._setParameter('texture_cubeMap', this.cubeMap);
        } else if (this.envAtlas && !isPhong) {
            this._setParameter('texture_envAtlas', this.envAtlas);
        } else if (this.cubeMap) {
            this._setParameter('texture_cubeMap', this.cubeMap);
        } else if (this.sphereMap) {
            this._setParameter('texture_sphereMap', this.sphereMap);
        }

        this._setParameter('material_reflectivity', this.reflectivity);

        // remove unused params
        this._processParameters('_activeParams');

        if (this._dirtyShader) {
            this.clearVariants();
        }
    }

    updateEnvUniforms(device, scene) {
        const isPhong = this.shadingModel === SPECULAR_PHONG;
        const hasLocalEnvOverride = (this.envAtlas && !isPhong) || this.cubeMap || this.sphereMap;

        if (!hasLocalEnvOverride && this.useSkybox) {
            if (scene.envAtlas && scene.skybox && !isPhong) {
                this._setParameter('texture_envAtlas', scene.envAtlas);
                this._setParameter('texture_cubeMap', scene.skybox);
            } else if (scene.envAtlas && !isPhong) {
                this._setParameter('texture_envAtlas', scene.envAtlas);
            } else if (scene.skybox) {
                this._setParameter('texture_cubeMap', scene.skybox);
            }

            if (!scene.skyboxRotation.equals(Quat.IDENTITY) && scene._skyboxRotationMat3) {
                this._setParameter('cubeMapRotationMatrix', scene._skyboxRotationMat3.data);
            }
        }

        this._processParameters('_activeLightingParams');
    }

    getShaderVariant(device, scene, objDefs, staticLightList, pass, sortedLights, viewUniformFormat, viewBindGroupFormat) {

        // update prefiltered lighting data
        this.updateEnvUniforms(device, scene);

        // Minimal options for Depth and Shadow passes
        const minimalOptions = pass === SHADER_DEPTH || pass === SHADER_PICK || ShaderPass.isShadow(pass);
        let options = minimalOptions ? standard.optionsContextMin : standard.optionsContext;

        if (minimalOptions)
            this.shaderOptBuilder.updateMinRef(options, scene, this, objDefs, staticLightList, pass, sortedLights);
        else
            this.shaderOptBuilder.updateRef(options, scene, this, objDefs, staticLightList, pass, sortedLights);

        // execute user callback to modify the options
        if (this.onUpdateShader) {
            options = this.onUpdateShader(options);
        }

        const processingOptions = new ShaderProcessorOptions(viewUniformFormat, viewBindGroupFormat);

        const library = device.getProgramLibrary();
        library.register('standard', standard);
        const shader = library.getProgram('standard', options, processingOptions);

        this._dirtyShader = false;
        return shader;
    }

    /**
     * Removes this material from the scene and possibly frees up memory from its shaders (if there
     * are no other materials using it).
     */
    destroy() {
        // unbind (texture) asset references
        for (const asset in this._assetReferences) {
            this._assetReferences[asset]._unbind();
        }
        this._assetReferences = null;

        super.destroy();
    }
}

// define a uniform get function
const defineUniform = (name, getUniformFunc) => {
    _uniforms[name] = getUniformFunc;
};

const definePropInternal = (name, constructorFunc, setterFunc, getterFunc) => {
    Object.defineProperty(StandardMaterial.prototype, name, {
        get: getterFunc || function () {
            return this[`_${name}`];
        },
        set: setterFunc
    });

    _props[name] = {
        value: constructorFunc
    };
};

// define a simple value property (float, string etc)
const defineValueProp = (prop) => {
    const internalName = `_${prop.name}`;
    const dirtyShaderFunc = prop.dirtyShaderFunc || (() => true);

    const setterFunc = function (value) {
        const oldValue = this[internalName];
        if (oldValue !== value) {
            this._dirtyShader = this._dirtyShader || dirtyShaderFunc(oldValue, value);
            this[internalName] = value;
        }
    };

    definePropInternal(prop.name, () => prop.defaultValue, setterFunc, prop.getterFunc);
};

// define an aggregate property (color, vec3 etc)
const defineAggProp = (prop) => {
    const internalName = `_${prop.name}`;
    const dirtyShaderFunc = prop.dirtyShaderFunc || (() => true);

    const setterFunc = function (value) {
        const oldValue = this[internalName];
        if (!oldValue.equals(value)) {
            this._dirtyShader = this._dirtyShader || dirtyShaderFunc(oldValue, value);
            this[internalName] = oldValue.copy(value);
        }
    };

    definePropInternal(prop.name, () => prop.defaultValue.clone(), setterFunc, prop.getterFunc);
};

// define either a value or aggregate property
const defineProp = (prop) => {
    return prop.defaultValue && prop.defaultValue.clone ? defineAggProp(prop) : defineValueProp(prop);
};

function _defineTex2D(name, uv, channels, defChannel, vertexColor, detailMode) {
    // store texture name
    _matTex2D[name] = channels;

    defineProp({
        name: `${name}Map`,
        defaultValue: null,
        dirtyShaderFunc: (oldValue, newValue) => {
            return !!oldValue !== !!newValue ||
                oldValue && (oldValue.type !== newValue.type ||
                             oldValue.fixCubemapSeams !== newValue.fixCubemapSeams ||
                             oldValue.format !== newValue.format);
        }
    });

    defineProp({
        name: `${name}MapTiling`,
        defaultValue: new Vec2(1, 1)
    });

    defineProp({
        name: `${name}MapOffset`,
        defaultValue: new Vec2(0, 0)
    });

    defineProp({
        name: `${name}MapRotation`,
        defaultValue: 0
    });

    defineProp({
        name: `${name}MapUv`,
        defaultValue: uv
    });

    if (channels > 0) {
        defineProp({
            name: `${name}MapChannel`,
            defaultValue: defChannel ? defChannel : (channels > 1 ? 'rgb' : 'g')
        });
    }

    if (vertexColor) {
        defineProp({
            name: `${name}VertexColor`,
            defaultValue: false
        });

        if (channels > 0) {
            defineProp({
                name: `${name}VertexColorChannel`,
                defaultValue: defChannel ? defChannel : (channels > 1 ? 'rgb' : 'g')
            });
        }
    }

    if (detailMode) {
        defineProp({
            name: `${name}Mode`,
            defaultValue: DETAILMODE_MUL
        });
    }

    // construct the transform uniform
    const mapTiling = `${name}MapTiling`;
    const mapOffset = `${name}MapOffset`;
    const mapRotation = `${name}MapRotation`;
    const mapTransform = `${name}MapTransform`;
    defineUniform(mapTransform, (material, device, scene) => {
        const tiling = material[mapTiling];
        const offset = material[mapOffset];
        const rotation = material[mapRotation];

        if (tiling.x === 1 && tiling.y === 1 &&
            offset.x === 0 && offset.y === 0 &&
            rotation === 0) {
            return null;
        }

        const uniform = material._allocUniform(mapTransform, () => {
            return [{
                name: `texture_${mapTransform}0`,
                value: new Float32Array(3)
            }, {
                name: `texture_${mapTransform}1`,
                value: new Float32Array(3)
            }];
        });

        const cr = Math.cos(rotation * math.DEG_TO_RAD);
        const sr = Math.sin(rotation * math.DEG_TO_RAD);

        const uniform0 = uniform[0].value;
        uniform0[0] = cr * tiling.x;
        uniform0[1] = -sr * tiling.y;
        uniform0[2] = offset.x;

        const uniform1 = uniform[1].value;
        uniform1[0] = sr * tiling.x;
        uniform1[1] = cr * tiling.y;
        uniform1[2] = 1.0 - tiling.y - offset.y;

        return uniform;
    });
}

function _defineColor(name, defaultValue) {
    defineProp({
        name: name,
        defaultValue: defaultValue,
        getterFunc: function () {
            // HACK: since we can't detect whether a user is going to set a color property
            // after calling this getter (i.e doing material.ambient.r = 0.5) we must assume
            // the worst and flag the shader as dirty.
            // This means currently animating a material colour is horribly slow.
            this._dirtyShader = true;
            return this[`_${name}`];
        }
    });

    defineUniform(name, (material, device, scene) => {
        const uniform = material._allocUniform(name, () => new Float32Array(3));
        const color = material[name];
        const gamma = material.useGammaTonemap && scene.gammaCorrection;

        if (gamma) {
            uniform[0] = Math.pow(color.r, 2.2);
            uniform[1] = Math.pow(color.g, 2.2);
            uniform[2] = Math.pow(color.b, 2.2);
        } else {
            uniform[0] = color.r;
            uniform[1] = color.g;
            uniform[2] = color.b;
        }

        return uniform;
    });
}

function _defineFloat(name, defaultValue, getUniformFunc) {
    defineProp({
        name: name,
        defaultValue: defaultValue,
        dirtyShaderFunc: (oldValue, newValue) => {
            // This is not always optimal and will sometimes trigger redundant shader
            // recompilation. However, no number property on a standard material
            // triggers a shader recompile if the previous and current values both
            // have a fractional part.
            return (oldValue === 0 || oldValue === 1) !== (newValue === 0 || newValue === 1);
        }
    });

    defineUniform(name, getUniformFunc);
}

function _defineObject(name, getUniformFunc) {
    defineProp({
        name: name,
        defaultValue: null,
        dirtyShaderFunc: (oldValue, newValue) => {
            return !!oldValue === !!newValue;
        }
    });

    defineUniform(name, getUniformFunc);
}

function _defineFlag(name, defaultValue) {
    defineProp({
        name: name,
        defaultValue: defaultValue
    });
}

function _defineMaterialProps() {
    _defineColor('ambient', new Color(0.7, 0.7, 0.7));
    _defineColor('diffuse', new Color(1, 1, 1));
    _defineColor('specular', new Color(0, 0, 0));
    _defineColor('emissive', new Color(0, 0, 0));
    _defineColor('sheen', new Color(1, 1, 1));
    _defineColor('attenuation', new Color(1, 1, 1));
    _defineFloat('emissiveIntensity', 1);
    _defineFloat('specularityFactor', 1);
    _defineFloat('sheenGlossiness', 0);

    _defineFloat('shininess', 25, (material, device, scene) => {
        // Shininess is 0-100 value which is actually a 0-1 glossiness value.
        return material.shadingModel === SPECULAR_PHONG ?
            // legacy: expand back to specular power
            Math.pow(2, material.shininess * 0.01 * 11) :
            material.shininess * 0.01;
    });
    _defineFloat('heightMapFactor', 1, (material, device, scene) => {
        return material.heightMapFactor * 0.025;
    });
    _defineFloat('opacity', 1);
    _defineFloat('alphaFade', 1);
    _defineFloat('alphaTest', 0);       // NOTE: overwrites Material.alphaTest
    _defineFloat('bumpiness', 1);
    _defineFloat('normalDetailMapBumpiness', 1);
    _defineFloat('reflectivity', 1);
    _defineFloat('occludeSpecularIntensity', 1);
    _defineFloat('refraction', 0);
    _defineFloat('refractionIndex', 1.0 / 1.5); // approx. (air ior / glass ior)
    _defineFloat('thickness', 0);
    _defineFloat('attenuationDistance', 0);
    _defineFloat('metalness', 1);
    _defineFloat('anisotropy', 0);
    _defineFloat('clearCoat', 0);
    _defineFloat('clearCoatGlossiness', 1);
    _defineFloat('clearCoatBumpiness', 1);
    _defineFloat('aoUvSet', 0, null); // legacy

    _defineFloat('iridescence', 0);
    _defineFloat('iridescenceRefractionIndex', 1.0 / 1.5);
    _defineFloat('iridescenceThicknessMin', 0);
    _defineFloat('iridescenceThicknessMax', 0);

    _defineObject('ambientSH');

    _defineObject('cubeMapProjectionBox', (material, device, scene) => {
        const uniform = material._allocUniform('cubeMapProjectionBox', () => {
            return [{
                name: 'envBoxMin',
                value: new Float32Array(3)
            }, {
                name: 'envBoxMax',
                value: new Float32Array(3)
            }];
        });

        const bboxMin = material.cubeMapProjectionBox.getMin();
        const minUniform = uniform[0].value;
        minUniform[0] = bboxMin.x;
        minUniform[1] = bboxMin.y;
        minUniform[2] = bboxMin.z;

        const bboxMax = material.cubeMapProjectionBox.getMax();
        const maxUniform = uniform[1].value;
        maxUniform[0] = bboxMax.x;
        maxUniform[1] = bboxMax.y;
        maxUniform[2] = bboxMax.z;

        return uniform;
    });

    _defineFlag('ambientTint', false);
    _defineFlag('diffuseTint', false);
    _defineFlag('specularTint', false);
    _defineFlag('specularityFactorTint', false);
    _defineFlag('emissiveTint', false);
    _defineFlag('fastTbn', false);
    _defineFlag('useMetalness', false);
    _defineFlag('useMetalnessSpecularColor', false);
    _defineFlag('useSheen', false);
    _defineFlag('enableGGXSpecular', false);
    _defineFlag('occludeDirect', false);
    _defineFlag('normalizeNormalMap', true);
    _defineFlag('conserveEnergy', true);
    _defineFlag('opacityFadesSpecular', true);
    _defineFlag('occludeSpecular', SPECOCC_AO);
    _defineFlag('shadingModel', SPECULAR_BLINN);
    _defineFlag('fresnelModel', FRESNEL_SCHLICK); // NOTE: this has been made to match the default shading model (to fix a bug)
    _defineFlag('useDynamicRefraction', false);
    _defineFlag('cubeMapProjection', CUBEPROJ_NONE);
    _defineFlag('customFragmentShader', null);
    _defineFlag('forceFragmentPrecision', null);
    _defineFlag('useFog', true);
    _defineFlag('useLighting', true);
    _defineFlag('useGammaTonemap', true);
    _defineFlag('useSkybox', true);
    _defineFlag('forceUv1', false);
    _defineFlag('pixelSnap', false);
    _defineFlag('twoSidedLighting', false);
    _defineFlag('nineSlicedMode', undefined); // NOTE: this used to be SPRITE_RENDERMODE_SLICED but was undefined pre-Rollup
    _defineFlag('msdfTextAttribute', false);
    _defineFlag('useIridescence', false);

    _defineTex2D('diffuse', 0, 3, '', true);
    _defineTex2D('specular', 0, 3, '', true);
    _defineTex2D('emissive', 0, 3, '', true);
    _defineTex2D('thickness', 0, 1, '', true);
    _defineTex2D('specularityFactor', 0, 1, '', true);
    _defineTex2D('normal', 0, -1, '', false);
    _defineTex2D('metalness', 0, 1, '', true);
    _defineTex2D('gloss', 0, 1, '', true);
    _defineTex2D('opacity', 0, 1, 'a', true);
    _defineTex2D('refraction', 0, 1, '', true);
    _defineTex2D('height', 0, 1, '', false);
    _defineTex2D('ao', 0, 1, '', true);
    _defineTex2D('light', 1, 3, '', true);
    _defineTex2D('msdf', 0, 3, '', false);
    _defineTex2D('diffuseDetail', 0, 3, '', false, true);
    _defineTex2D('normalDetail', 0, -1, '', false);
    _defineTex2D('clearCoat', 0, 1, '', true);
    _defineTex2D('clearCoatGloss', 0, 1, '', true);
    _defineTex2D('clearCoatNormal', 0, -1, '', false);
    _defineTex2D('sheen', 0, 3, '', true);
    _defineTex2D('sheenGloss', 0, 1, '', true);

    _defineTex2D('iridescence', 0, 1, '', true);
    _defineTex2D('iridescenceThickness', 0, 1, '', true);

    _defineObject('cubeMap');
    _defineObject('sphereMap');
    _defineObject('envAtlas');

    // prefiltered cubemap getter
    const getterFunc = function () {
        return this._prefilteredCubemaps;
    };

    // prefiltered cubemap setter
    const setterFunc = function (value) {
        const cubemaps = this._prefilteredCubemaps;

        value = value || [];

        let changed = false;
        let complete = true;
        for (let i = 0; i < 6; ++i) {
            const v = value[i] || null;
            if (cubemaps[i] !== v) {
                cubemaps[i] = v;
                changed = true;
            }
            complete = complete && (!!cubemaps[i]);
        }

        if (changed) {
            if (complete) {
                this.envAtlas = EnvLighting.generatePrefilteredAtlas(cubemaps, {
                    target: this.envAtlas
                });
            } else {
                if (this.envAtlas) {
                    this.envAtlas.destroy();
                    this.envAtlas = null;
                }
            }
            this._dirtyShader = true;
        }
    };

    const empty = [null, null, null, null, null, null];

    definePropInternal('prefilteredCubemaps', () => empty.slice(), setterFunc, getterFunc);
}

_defineMaterialProps();

export { StandardMaterial };
