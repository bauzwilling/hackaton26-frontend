import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { BoxParam, InputLists } from "../types";
import {
  CSV_GH_INPUT_NAMES,
  CSV_GH_PARAM_BOUNDS,
  CSV_GH_PARAM_LABELS,
  getVariationRowCount,
  isParamValueValid,
} from "../lib/csv.js";

type Props = {
  inputLists: InputLists | null;
  selectedIndex: number;
  onSelect: (index: number) => void;
};

export function ParallelCoordinates({ inputLists, selectedIndex, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container || !inputLists) return;
    const lists = inputLists;

    function draw() {
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      d3.select(container).selectAll("*").remove();
      const margin = { top: 30, right: 38, bottom: 20, left: 42 };
      const innerWidth = Math.max(width - margin.left - margin.right, 80);
      const innerHeight = Math.max(height - margin.top - margin.bottom, 60);
      const svg = d3.select(container).append("svg").attr("width", width).attr("height", height)
        .append("g").attr("transform", `translate(${margin.left},${margin.top})`);
      const params = CSV_GH_INPUT_NAMES as BoxParam[];
      const x = d3.scalePoint<BoxParam>().domain(params).range([0, innerWidth]);
      const scales = Object.fromEntries(params.map((param) => [
        param,
        d3.scaleLinear()
          .domain([CSV_GH_PARAM_BOUNDS[param].min, CSV_GH_PARAM_BOUNDS[param].max])
          .range([innerHeight, 0]),
      ])) as Record<BoxParam, d3.ScaleLinear<number, number>>;

      params.forEach((param) => {
        const axis = d3.axisLeft(scales[param]).ticks(5);
        svg.append("g").attr("transform", `translate(${x(param)},0)`).call(axis);
        svg.append("text").attr("x", x(param) ?? 0).attr("y", -10).attr("text-anchor", "middle")
          .attr("font-size", 11).attr("font-weight", 600).text(CSV_GH_PARAM_LABELS[param]);
      });

      const line = d3.line<[number, number]>();
      for (let index = 0; index < getVariationRowCount(lists); index++) {
        if (!params.every((param) => isParamValueValid(lists[param]?.[index], param))) continue;
        const path = line(params.map((param) => [x(param) ?? 0, scales[param](lists[param][index] as number)]));
        svg.append("path")
          .attr("d", path)
          .attr("fill", "none")
          .attr("stroke", "#3498db")
          .attr("stroke-width", index === selectedIndex ? 3 : 1.5)
          .attr("opacity", selectedIndex < 0 || index === selectedIndex ? 1 : 0.28)
          .style("cursor", "pointer")
          .on("pointerup", () => onSelect(selectedIndex === index ? -1 : index));
      }
    }

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => {
      observer.disconnect();
      d3.select(container).selectAll("*").remove();
    };
  }, [inputLists, selectedIndex, onSelect]);

  return (
    <div className="boxouts-plot">
      {!inputLists && <p className="boxouts-empty">Add boxes in the chat to preview them here</p>}
      <div ref={ref} className="boxouts-plot-svg" />
    </div>
  );
}
