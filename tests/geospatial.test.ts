import { describe, expect, it } from "vitest";
import { boundingBoxes, haversineKm } from "../packages/orchestrator/src/index.ts";

describe("geospatial correctness", () => {
  it("uses [longitude, latitude] ordering and kilometer distances", () => expect(haversineKm([-118.2437, 34.0522], [-117.2437, 34.0522])).toBeCloseTo(92.2, 0));
  it("splits antimeridian bounding boxes", () => { const boxes = boundingBoxes(0, 179.8, 100); expect(boxes).toHaveLength(2); expect(boxes[0]!.east).toBe(180); expect(boxes[1]!.west).toBe(-180); });
  it("keeps ordinary bounds as one box", () => expect(boundingBoxes(34, -118, 10)).toHaveLength(1));
});
