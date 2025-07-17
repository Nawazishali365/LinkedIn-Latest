fetch("/data")
  .then((res) => res.json())
  .then((fullData) => {
    debugger;
    const canvas = document.getElementById("graphCanvas");
    const context = canvas.getContext("2d");

    const NODE_RADIUS = 6;
    const DRAG_RADIUS = 8;
    const FONT_SIZE = 11;
    const MARGIN_LABEL = 8;

    let width = canvas.width;
    let height = canvas.height;

    let draggedNode = null;
    let hoveredNode = null;
    let isDragging = false;
    let animationFrame;

    // ✅ FILTER MALFORMED OR EXTRA CSV LINES
    const isValidNode = (n) =>
      n &&
      typeof n.id === "string" &&
      n.id.trim() !== "" &&
      typeof n.group === "string";

    const groupedByCompany = d3.group(fullData.nodes.filter(isValidNode), (n) =>
      n.group.trim()
    );

    const originalNodes = [];
    for (const [group, nodes] of groupedByCompany) {
      if (group === "You") {
        // Always include "You"
        originalNodes.push(
          ...nodes.map((n) => ({
            id: n.id.trim(),
            group: group,
            position: n.position || "",
          }))
        );
      } else {
        const trimmedNodes = nodes.slice(0, 100); // Limit to 100 for visual
        originalNodes.push(
          ...trimmedNodes.map((n) => ({
            id: n.id.trim(),
            group: group,
            position: n.position || "",
          }))
        );
      }
    }

    const allNodeIds = new Set(originalNodes.map((n) => n.id));

    const originalLinks = (fullData.links || []).filter((l) => {
      const source = typeof l.source === "object" ? l.source.id : l.source;
      const target = typeof l.target === "object" ? l.target.id : l.target;
      return allNodeIds.has(source) && allNodeIds.has(target);
    });
    const groupCountsMap = d3.rollup(
      originalNodes.filter((n) => n.group !== "You"),
      (v) => v.length,
      (d) => d.group
    );

    const groupCounts = Array.from(groupCountsMap.entries());
    groupCounts.sort((a, b) => b[1] - a[1]);
    const groups = groupCounts.map(([group]) => group);

    const colorScale = d3
      .scaleOrdinal()
      .domain(groups)
      .range(d3.schemeCategory10.concat(d3.schemePaired));

    const clusterCenters = {};
    const radius = Math.min(width, height) / 2.5;
    const centerX = width / 2;
    const centerY = height / 2;

    groups.forEach((group, i) => {
      const angle = (i / groups.length) * 2 * Math.PI;
      clusterCenters[group] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    });

    let currentNodes = [...originalNodes];
    let currentLinks = [...originalLinks];

    const simulation = d3
      .forceSimulation(currentNodes)
      .force(
        "link",
        d3
          .forceLink(currentLinks)
          .id((d) => d.id)
          .distance(90)
      )
      .force("charge", d3.forceManyBody().strength(-350))
      .force("collision", d3.forceCollide(NODE_RADIUS * 3))
      .force(
        "x",
        d3
          .forceX((d) =>
            d.group === "You" ? centerX : clusterCenters[d.group]?.x || centerX
          )
          .strength((d) => (d.group === "You" ? 1 : 0.3))
      )
      .force(
        "y",
        d3
          .forceY((d) =>
            d.group === "You" ? centerY : clusterCenters[d.group]?.y || centerY
          )
          .strength((d) => (d.group === "You" ? 1 : 0.3))
      )
      .force("center", d3.forceCenter(centerX, centerY));

    const tooltip = document.createElement("div");
    tooltip.className = "tooltip";
    Object.assign(tooltip.style, {
      position: "absolute",
      background: "#fff",
      padding: "6px 10px",
      border: "1px solid #ccc",
      borderRadius: "4px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      pointerEvents: "none",
      opacity: 0,
      transition: "opacity 0.2s",
      zIndex: 10,
    });
    document.body.appendChild(tooltip);

    canvas.addEventListener("mousedown", (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      draggedNode = currentNodes.find(
        (d) => Math.hypot(d.x - x, d.y - y) < DRAG_RADIUS
      );
      if (draggedNode) {
        isDragging = true;
        draggedNode.fx = draggedNode.x;
        draggedNode.fy = draggedNode.y;
        simulation.alphaTarget(0.3).restart();
        debugger;
        simulation
          .force("center", d3.forceCenter(width / 2, height / 2))
          .force("charge", d3.forceManyBody().strength(-80))
          .force(
            "link",
            d3
              .forceLink(links)
              .id((d) => d.id)
              .distance(100)
          )
          .force("collide", d3.forceCollide(30));
      }
    });

    canvas.addEventListener("mousemove", (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      if (draggedNode && isDragging) {
        draggedNode.fx = x;
        draggedNode.fy = y;
      }

      const prevHovered = hoveredNode;
      hoveredNode = currentNodes.find(
        (d) => Math.hypot(d.x - x, d.y - y) < NODE_RADIUS + 2
      );

      if (hoveredNode !== prevHovered) {
        if (hoveredNode) {
          tooltip.innerHTML = `<strong>${hoveredNode.id}</strong><br>${
            hoveredNode.group
          }<br>${hoveredNode.position || ""}`;
          tooltip.style.left = `${event.pageX + 12}px`;
          tooltip.style.top = `${event.pageY - 24}px`;
          tooltip.style.opacity = 1;
        } else {
          tooltip.style.opacity = 0;
        }
      }
    });

    canvas.addEventListener("mouseup", () => {
      if (draggedNode) {
        draggedNode.fx = null;
        draggedNode.fy = null;
        simulation.alphaTarget(0);
        draggedNode = null;
        isDragging = false;
      }
    });

    window.addEventListener("resize", () => {
      width = canvas.width;
      height = canvas.height;
      simulation.force("center", d3.forceCenter(width / 2, height / 2));
      simulation.alpha(0.5).restart();
    });

    function draw() {
      context.clearRect(0, 0, width, height);

      const hullGroups = Array.from(new Set(currentNodes.map((n) => n.group)));
      hullGroups.forEach((group) => {
        if (group === "You") return;

        const groupNodes = currentNodes.filter((d) => d.group === group);
        if (groupNodes.length < 1) return;

        const points = groupNodes.map((d) => [d.x, d.y]);
        const hull = points.length > 2 ? d3.polygonHull(points) : null;

        if (hull) {
          context.beginPath();
          context.moveTo(hull[0][0], hull[0][1]);
          for (let i = 1; i < hull.length; i++)
            context.lineTo(hull[i][0], hull[i][1]);
          context.closePath();
          context.fillStyle = colorScale(group);
          context.globalAlpha = 0.15;
          context.fill();
          context.globalAlpha = 1.0;
        }

        const farthestNode = groupNodes.reduce((farthest, node) => {
          const dist = Math.hypot(node.x - centerX, node.y - centerY);
          const farthestDist = Math.hypot(
            farthest.x - centerX,
            farthest.y - centerY
          );
          return dist > farthestDist ? node : farthest;
        }, groupNodes[0]);

        const dx = farthestNode.x - centerX;
        const dy = farthestNode.y - centerY;
        const labelX = farthestNode.x + dx * 0.2;
        const labelY = farthestNode.y + dy * 0.2;

        context.font = "bold 14px sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "white";
        context.fillRect(labelX - 50, labelY - 10, 100, 20);
        context.strokeStyle = "#ccc";
        context.strokeRect(labelX - 50, labelY - 10, 100, 20);
        context.fillStyle = "#000";
        context.fillText(group, labelX, labelY);

        context.beginPath();
        context.moveTo(farthestNode.x, farthestNode.y);
        context.lineTo(labelX, labelY);
        context.strokeStyle = "#aaa";
        context.stroke();
      });

      context.beginPath();
      context.strokeStyle = "#aaa";
      currentLinks.forEach((link) => {
        const source =
          typeof link.source === "object"
            ? link.source
            : originalNodes.find((n) => n.id === link.source);
        const target =
          typeof link.target === "object"
            ? link.target
            : originalNodes.find((n) => n.id === link.target);
        if (source && target) {
          context.moveTo(source.x, source.y);
          context.lineTo(target.x, target.y);
        }
      });
      context.stroke();

      currentNodes.forEach((node) => {
        context.beginPath();
        context.arc(node.x, node.y, NODE_RADIUS, 0, 2 * Math.PI);
        context.fillStyle =
          node.group === "You" ? "#e31a1c" : colorScale(node.group);
        context.fill();
        context.fillStyle = "#222";
        context.font = `${FONT_SIZE}px sans-serif`;
        context.fillText(node.id, node.x + MARGIN_LABEL, node.y + 3);
      });
    }

    simulation.on("tick", () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(draw);
    });

    setTimeout(() => {
      const container = document.getElementById("canvasContainer");
      const canvas = document.getElementById("graphCanvas");
      const scrollLeft = (canvas.width - container.clientWidth) / 2;
      const scrollTop = (canvas.height - container.clientHeight) / 2;
      container.scrollLeft = scrollLeft;
      container.scrollTop = scrollTop;
    }, 500);

    // ✅ LEGEND SUPPORTING FILTERS AND "OTHERS"
    const legendContainer = d3.select("#legend");
    const visibleGroups = new Set();

    groupCounts.forEach(([group, count]) => {
      if (group !== "You" && count >= 10) {
        visibleGroups.add(group);
      }
    });

    groupCounts.forEach(([group, count]) => {
      if (group === "You") return;
      const item = legendContainer
        .append("div")
        .style("display", "flex")
        .style("align-items", "center")
        .style("margin-bottom", "5px");

      item
        .append("input")
        .attr("type", "checkbox")
        .property("checked", count >= 10)
        .style("margin-right", "6px")
        .on("change", function () {
          if (this.checked) {
            visibleGroups.add(group);
          } else {
            visibleGroups.delete(group);
          }

          updateGraphVisibility();
        });

      updateGraphVisibility();

      item
        .append("div")
        .style("width", "12px")
        .style("height", "12px")
        .style("background-color", colorScale(group))
        .style("margin-right", "6px")
        .style("border-radius", "2px");

      item.append("span").text(`${group} (${count})`);
    });

    legendContainer
      .append("div")
      .style("margin-top", "10px")
      .style("font-weight", "bold")
      .text(`Total Nodes: ${originalNodes.length}`);

    function updateGraphVisibility() {
      // 1. Filter visible nodes
      currentNodes = originalNodes.filter(
        (n) => n.group === "You" || visibleGroups.has(n.group)
      );

      // 2. Filter links based on visible node IDs
      const currentNodeIds = new Set(currentNodes.map((n) => n.id));
      currentLinks = originalLinks.filter(
        (l) =>
          currentNodeIds.has(
            typeof l.source === "object" ? l.source.id : l.source
          ) &&
          currentNodeIds.has(
            typeof l.target === "object" ? l.target.id : l.target
          )
      );

      // 3. Recalculate dynamic cluster centers (ONLY for visible groups)
      const visibleGroupsArray = Array.from(visibleGroups);
      const spreadRadius = Math.min(width, height) / 2.3;
      const localClusterCenters = {};

      visibleGroupsArray.forEach((group, i) => {
        const angle = (i / visibleGroupsArray.length) * 2 * Math.PI;
        localClusterCenters[group] = {
          x: centerX + spreadRadius * Math.cos(angle),
          y: centerY + spreadRadius * Math.sin(angle),
        };
      });

      // 4. Update forces (target cluster center for each node)
      simulation
        .nodes(currentNodes)
        .force(
          "link",
          d3
            .forceLink(currentLinks)
            .id((d) => d.id)
            .distance(50)
        )
        .force(
          "x",
          d3
            .forceX((d) =>
              d.group === "You"
                ? centerX
                : localClusterCenters[d.group]?.x || centerX
            )
            .strength((d) => (d.group === "You" ? 1 : 0.4))
        )
        .force(
          "y",
          d3
            .forceY((d) =>
              d.group === "You"
                ? centerY
                : localClusterCenters[d.group]?.y || centerY
            )
            .strength((d) => (d.group === "You" ? 1 : 0.4))
        );

      // 5. Restart simulation
      simulation.alpha(0.9).restart();
    }
  });
