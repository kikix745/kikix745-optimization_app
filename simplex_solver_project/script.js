let variableCount = 2;
let constraintCount = 2;

const element = (id) => document.getElementById(id);

function formatNumber(value) {
  if (Math.abs(value) < 1e-9) return "0";
  return String(Number(value.toFixed(6)));
}

function numericInput(value, label, extraClass = "") {
  return `<input type="number" step="any" value="${value}"
    aria-label="${label}" inputmode="decimal" class="${extraClass}">`;
}

function renderInputs() {
  const oldObjective = [...element("objective").querySelectorAll("input")]
    .map((input) => input.value);

  const oldConstraints = [...element("constraints").children].map((row) => ({
    coefficients: [...row.querySelectorAll(".coefficients input")]
      .map((input) => input.value),
    rhs: row.querySelector(".rhs").value
  }));

  element("varCount").textContent = variableCount;
  element("conCount").textContent = constraintCount;
  element("minusVar").disabled = variableCount <= 1;
  element("plusVar").disabled = variableCount >= 6;
  element("minusCon").disabled = constraintCount <= 1;
  element("plusCon").disabled = constraintCount >= 8;

  element("objective").innerHTML = `
    <div class="objective-row" style="--columns:${variableCount}">
      ${Array.from({ length: variableCount }, (_, index) => `
        <div>
          <div class="variable-label">x${index + 1}</div>
          ${numericInput(
            oldObjective[index] ?? (index === 0 ? 3 : 2),
            `Objective coefficient x${index + 1}`
          )}
        </div>
      `).join("")}
    </div>
  `;

  element("constraints").innerHTML = Array.from(
    { length: constraintCount }, (_, rowIndex) => `
      <div class="constraint-row">
        <div class="coefficients" style="--columns:${variableCount}">
          ${Array.from({ length: variableCount }, (_, columnIndex) => {
            const defaultValue = rowIndex === 0
              ? 1
              : (columnIndex === 0 ? 2 : 1);
            return numericInput(
              oldConstraints[rowIndex]?.coefficients[columnIndex] ?? defaultValue,
              `Constraint ${rowIndex + 1}, coefficient x${columnIndex + 1}`
            );
          }).join("")}
        </div>
        <div class="operator">≤</div>
        ${numericInput(
          oldConstraints[rowIndex]?.rhs ?? (rowIndex === 0 ? 4 : 6),
          `Constraint ${rowIndex + 1} right-hand side`,
          "rhs"
        )}
      </div>
    `
  ).join("");

  element("result").style.display = "none";
  element("error").style.display = "none";
}

element("plusVar").addEventListener("click", () => {
  if (variableCount < 6) {
    variableCount += 1;
    renderInputs();
  }
});

element("minusVar").addEventListener("click", () => {
  if (variableCount > 1) {
    variableCount -= 1;
    renderInputs();
  }
});

element("plusCon").addEventListener("click", () => {
  if (constraintCount < 8) {
    constraintCount += 1;
    renderInputs();
  }
});

element("minusCon").addEventListener("click", () => {
  if (constraintCount > 1) {
    constraintCount -= 1;
    renderInputs();
  }
});

function readProblem() {
  const objective = [...element("objective").querySelectorAll("input")]
    .map((input) => Number(input.value));

  const constraints = [...element("constraints").children].map((row) => ({
    coefficients: [...row.querySelectorAll(".coefficients input")]
      .map((input) => Number(input.value)),
    rhs: Number(row.querySelector(".rhs").value)
  }));

  const values = [
    ...objective,
    ...constraints.flatMap((row) => [...row.coefficients, row.rhs])
  ];

  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("Enter a valid number in every field.");
  }

  if (constraints.some((row) => row.rhs < 0)) {
    throw new Error(
      "Each right-hand side must be ≥ 0 in this standard simplex version."
    );
  }

  return { objective, constraints };
}

/*
 * Tableau convention:
 * - Slack variables are appended to each ≤ constraint.
 * - The objective row starts with -c.
 * - The most negative objective-row coefficient enters the basis.
 * - The minimum nonnegative ratio determines the leaving row.
 */
function solveSimplex(objective, constraints) {
  const variableCount = objective.length;
  const constraintCount = constraints.length;
  const totalVariables = variableCount + constraintCount;
  const rhsColumn = totalVariables;

  const tableau = constraints.map((constraint, rowIndex) => [
    ...constraint.coefficients,
    ...Array.from(
      { length: constraintCount },
      (_, index) => index === rowIndex ? 1 : 0
    ),
    constraint.rhs
  ]);

  tableau.push([
    ...objective.map((coefficient) => -coefficient),
    ...Array(constraintCount).fill(0),
    0
  ]);

  const basis = constraints.map((_, index) => variableCount + index);
  const steps = [];

  function saveStep(label) {
    steps.push({
      label,
      tableau: tableau.map((row) => [...row]),
      basis: [...basis]
    });
  }

  saveStep("Initial tableau");

  for (let iteration = 0; iteration < 500; iteration += 1) {
    const objectiveRow = tableau[constraintCount];
    let enteringColumn = -1;
    let mostNegative = -1e-9;

    for (let column = 0; column < totalVariables; column += 1) {
      if (objectiveRow[column] < mostNegative) {
        mostNegative = objectiveRow[column];
        enteringColumn = column;
      }
    }

    if (enteringColumn === -1) {
      const solution = Array(variableCount).fill(0);

      basis.forEach((basicVariable, rowIndex) => {
        if (basicVariable < variableCount) {
          solution[basicVariable] = tableau[rowIndex][rhsColumn];
        }
      });

      return {
        status: "optimal",
        solution,
        objectiveValue: tableau[constraintCount][rhsColumn],
        steps
      };
    }

    let leavingRow = -1;
    let minimumRatio = Infinity;

    for (let row = 0; row < constraintCount; row += 1) {
      const pivotCoefficient = tableau[row][enteringColumn];

      if (pivotCoefficient > 1e-9) {
        const ratio = tableau[row][rhsColumn] / pivotCoefficient;
        if (ratio < minimumRatio - 1e-9) {
          minimumRatio = ratio;
          leavingRow = row;
        }
      }
    }

    if (leavingRow === -1) {
      return { status: "unbounded", steps };
    }

    const pivot = tableau[leavingRow][enteringColumn];

    for (let column = 0; column <= rhsColumn; column += 1) {
      tableau[leavingRow][column] /= pivot;
    }

    for (let row = 0; row <= constraintCount; row += 1) {
      if (row === leavingRow) continue;

      const factor = tableau[row][enteringColumn];
      if (Math.abs(factor) <= 1e-12) continue;

      for (let column = 0; column <= rhsColumn; column += 1) {
        tableau[row][column] -= factor * tableau[leavingRow][column];
      }
    }

    basis[leavingRow] = enteringColumn;
    saveStep(`Iteration ${iteration + 1}`);
  }

  return { status: "iteration-limit", steps };
}

function renderTableau(step, variableCount, constraintCount) {
  const totalVariables = variableCount + constraintCount;
  let html = `<h3 class="iteration-title">${step.label}</h3>
    <div class="table-wrapper"><table><thead><tr><th>Basic</th>`;

  for (let column = 0; column < totalVariables; column += 1) {
    const name = column < variableCount
      ? `x${column + 1}`
      : `s${column - variableCount + 1}`;
    html += `<th>${name}</th>`;
  }

  html += "<th>RHS</th></tr></thead><tbody>";

  step.tableau.forEach((row, rowIndex) => {
    const basicName = rowIndex === constraintCount
      ? "Z"
      : step.basis[rowIndex] < variableCount
        ? `x${step.basis[rowIndex] + 1}`
        : `s${step.basis[rowIndex] - variableCount + 1}`;

    html += `<tr><td>${basicName}</td>`;
    row.forEach((value) => {
      html += `<td>${formatNumber(value)}</td>`;
    });
    html += "</tr>";
  });

  return `${html}</tbody></table></div>`;
}

element("solve").addEventListener("click", () => {
  try {
    const { objective, constraints } = readProblem();
    const result = solveSimplex(objective, constraints);

    if (result.status === "unbounded") {
      throw new Error(
        "The objective is unbounded: no finite maximum exists for these inputs."
      );
    }

    if (result.status !== "optimal") {
      throw new Error(
        "The iteration limit was reached. Check the inputs for numerical instability."
      );
    }

    element("zvalue").textContent = formatNumber(result.objectiveValue);
    element("solution").innerHTML = result.solution.map((value, index) => `
      <div class="solution-item">
        <span>Decision variable x${index + 1}</span>
        <strong>${formatNumber(value)}</strong>
      </div>
    `).join("");

    element("iterations").innerHTML = result.steps.map((step) =>
      renderTableau(step, objective.length, constraints.length)
    ).join("");

    element("error").style.display = "none";
    element("result").style.display = "block";
    element("result").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    element("error").textContent = error.message;
    element("error").style.display = "block";
    element("result").style.display = "none";
  }
});

renderInputs();
