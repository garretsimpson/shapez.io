import { globalConfig } from "../core/config";
import { DrawParameters } from "../core/draw_parameters";
import { findNiceIntegerValue } from "../core/utils";
import { Vector } from "../core/vector";
import { Entity } from "./entity";
import { ACHIEVEMENTS } from "../platform/achievement_provider";
import { GameRoot } from "./root";
import { SerializerInternal } from "../savegame/serializer_internal";
import { createLogger } from "../core/logging";

const logger = createLogger("blueprint");

export class Blueprint {
    /**
     * @param {Array<Entity>} entities
     */
    constructor(entities) {
        this.entities = entities;
    }

    /**
     * Returns the layer of this blueprint
     * @returns {Layer}
     */
    get layer() {
        if (this.entities.length === 0) {
            return "regular";
        }
        return this.entities[0].layer;
    }

    /**
     * Serialize
     */
    serialize() {
        let data = new SerializerInternal().serializeEntityArray(this.entities);
        // Remove unneeded fields
        for (let i = 0; i < data.length; ++i) {
            const entry = data[i];
            delete entry.uid;
            delete entry.components.WiredPins;
        }
        return data;
    }

    /**
     * Deserialize
     * @param {GameRoot} root
     * @param {Object} json
     * @retruns {Blueprint|void}
     */
    static deserialize(root, json) {
        try {
            if (typeof json != "object") {
                return;
            }
            if (!Array.isArray(json)) {
                return;
            }

            const serializer = new SerializerInternal();
            /** @type {Array<Entity>} */
            const entityArray = [];
            for (let i = 0; i < json.length; ++i) {
                /** @type {Entity?} */
                const value = json[i];
                if (value.components == undefined || value.components.StaticMapEntity == undefined) {
                    return;
                }
                const staticData = value.components.StaticMapEntity;
                if (staticData.code == undefined || staticData.origin == undefined) {
                    return;
                }
                const result = serializer.deserializeEntity(root, value);
                if (typeof result === "string") {
                    throw new Error(result);
                }
                entityArray.push(result);
            }
            return new Blueprint(entityArray);
        } catch (e) {
            logger.error("Invalid blueprint data:", e.message);
        }
    }

    /**
     * Creates a new blueprint from the given entity uids
     * @param {GameRoot} root
     * @param {Array<number>} uids
     */
    static fromUids(root, uids) {
        const newEntities = [];

        let averagePosition = new Vector();

        // First, create a copy
        for (let i = 0; i < uids.length; ++i) {
            const entity = root.entityMgr.findByUid(uids[i]);
            assert(entity, "Entity for blueprint not found:" + uids[i]);

            const clone = entity.clone();
            newEntities.push(clone);

            const pos = entity.components.StaticMapEntity.getTileSpaceBounds().getCenter();
            averagePosition.addInplace(pos);
        }

        averagePosition.divideScalarInplace(uids.length);
        const blueprintOrigin = averagePosition.subScalars(0.5, 0.5).floor();

        for (let i = 0; i < uids.length; ++i) {
            newEntities[i].components.StaticMapEntity.origin.subInplace(blueprintOrigin);
        }

        // Now, make sure the origin is 0,0
        return new Blueprint(newEntities);
    }

    /**
     * Returns the cost of this blueprint in shapes
     */
    getCost() {
        if (G_IS_DEV && globalConfig.debug.blueprintsNoCost) {
            return 0;
        }
        return findNiceIntegerValue(4 * Math.pow(this.entities.length, 1.1));
    }

    /**
     * Draws the blueprint at the given origin
     * @param {DrawParameters} parameters
     */
    draw(parameters, tile) {
        parameters.context.globalAlpha = 0.8;
        for (let i = 0; i < this.entities.length; ++i) {
            const entity = this.entities[i];
            const staticComp = entity.components.StaticMapEntity;
            const newPos = staticComp.origin.add(tile);

            const rect = staticComp.getTileSpaceBounds();
            rect.moveBy(tile.x, tile.y);

            if (!parameters.root.logic.checkCanPlaceEntity(entity, tile)) {
                parameters.context.globalAlpha = 0.3;
            } else {
                parameters.context.globalAlpha = 1;
            }

            staticComp.drawSpriteOnBoundsClipped(parameters, staticComp.getBlueprintSprite(), 0, newPos);
        }
        parameters.context.globalAlpha = 1;
    }

    /**
     * Rotates the blueprint clockwise
     */
    rotateCw() {
        for (let i = 0; i < this.entities.length; ++i) {
            const entity = this.entities[i];
            const staticComp = entity.components.StaticMapEntity;

            staticComp.rotation = (staticComp.rotation + 90) % 360;
            staticComp.originalRotation = (staticComp.originalRotation + 90) % 360;
            staticComp.origin = staticComp.origin.rotateFastMultipleOf90(90);
        }
    }

    /**
     * Rotates the blueprint counter clock wise
     */
    rotateCcw() {
        // Well ...
        for (let i = 0; i < 3; ++i) {
            this.rotateCw();
        }
    }

    /**
     * Checks if the blueprint can be placed at the given tile
     * @param {GameRoot} root
     * @param {Vector} tile
     */
    canPlace(root, tile) {
        let anyPlaceable = false;

        for (let i = 0; i < this.entities.length; ++i) {
            const entity = this.entities[i];
            if (root.logic.checkCanPlaceEntity(entity, tile)) {
                anyPlaceable = true;
            }
        }

        return anyPlaceable;
    }

    /**
     * @param {GameRoot} root
     */
    canAfford(root) {
        return root.hubGoals.getShapesStoredByKey(root.gameMode.getBlueprintShapeKey()) >= this.getCost();
    }

    /**
     * Attempts to place the blueprint at the given tile
     * @param {GameRoot} root
     * @param {Vector} tile
     */
    tryPlace(root, tile) {
        return root.logic.performBulkOperation(() => {
            let count = 0;
            for (let i = 0; i < this.entities.length; ++i) {
                const entity = this.entities[i];
                if (!root.logic.checkCanPlaceEntity(entity, tile)) {
                    continue;
                }

                const clone = entity.clone();
                clone.components.StaticMapEntity.origin.addInplace(tile);
                root.logic.freeEntityAreaBeforeBuild(clone);
                root.map.placeStaticEntity(clone);
                root.entityMgr.registerEntity(clone);
                count++;
            }

            root.signals.bulkAchievementCheck.dispatch(
                ACHIEVEMENTS.placeBlueprint,
                count,
                ACHIEVEMENTS.placeBp1000,
                count
            );

            return count !== 0;
        });
    }
}
