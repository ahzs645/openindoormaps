export function createCoordinateTransform(transformConfig = {}) {
  const controlPoints = transformConfig.controlPoints ?? [];
  if (
    transformConfig.mode === "identity" ||
    !Array.isArray(controlPoints) ||
    controlPoints.length === 0
  ) {
    return (point) => [point[0], point[1]];
  }

  if (controlPoints.length >= 3) {
    return createAffineTransform(controlPoints.slice(0, 3));
  }

  if (controlPoints.length === 2) {
    return createSimilarityTransform(controlPoints);
  }

  throw new Error(
    "At least two control points are required when using control-point georeferencing.",
  );
}

export function createLeastSquaresAffineTransform(controlPoints = []) {
  if (!Array.isArray(controlPoints) || controlPoints.length < 3) {
    throw new Error(
      "At least three control points are required for least-squares affine georeferencing.",
    );
  }

  const sourceMatrix = controlPoints.map((point) => [
    point.source[0],
    point.source[1],
    1,
  ]);
  const targetX = controlPoints.map((point) => point.target[0]);
  const targetY = controlPoints.map((point) => point.target[1]);

  const normalMatrix = buildNormalMatrix(sourceMatrix);
  const normalTargetX = buildNormalVector(sourceMatrix, targetX);
  const normalTargetY = buildNormalVector(sourceMatrix, targetY);

  const [a, b, c] = solveLinearSystem(normalMatrix, normalTargetX);
  const [d, e, f] = solveLinearSystem(normalMatrix, normalTargetY);

  return (point) => [
    a * point[0] + b * point[1] + c,
    d * point[0] + e * point[1] + f,
  ];
}

function createSimilarityTransform(controlPoints) {
  const [sourceA, sourceB] = controlPoints.map((point) => point.cad);
  const [targetA, targetB] = controlPoints.map((point) => point.geo);

  const sourceVector = [sourceB[0] - sourceA[0], sourceB[1] - sourceA[1]];
  const targetVector = [targetB[0] - targetA[0], targetB[1] - targetA[1]];

  const sourceMagnitude = Math.hypot(sourceVector[0], sourceVector[1]);
  const targetMagnitude = Math.hypot(targetVector[0], targetVector[1]);
  if (sourceMagnitude === 0 || targetMagnitude === 0) {
    throw new Error("Control points must not overlap.");
  }

  const scale = targetMagnitude / sourceMagnitude;
  const cosine =
    (sourceVector[0] * targetVector[0] + sourceVector[1] * targetVector[1]) /
    (sourceMagnitude * targetMagnitude);
  const sine =
    (sourceVector[0] * targetVector[1] - sourceVector[1] * targetVector[0]) /
    (sourceMagnitude * targetMagnitude);

  return (point) => {
    const deltaX = point[0] - sourceA[0];
    const deltaY = point[1] - sourceA[1];

    return [
      targetA[0] + scale * (deltaX * cosine - deltaY * sine),
      targetA[1] + scale * (deltaX * sine + deltaY * cosine),
    ];
  };
}

function createAffineTransform(controlPoints) {
  const sourceMatrix = controlPoints.map((point) => [
    point.cad[0],
    point.cad[1],
    1,
  ]);
  const targetX = controlPoints.map((point) => point.geo[0]);
  const targetY = controlPoints.map((point) => point.geo[1]);

  const [a, b, c] = solveLinearSystem(sourceMatrix, targetX);
  const [d, e, f] = solveLinearSystem(sourceMatrix, targetY);

  return (point) => [
    a * point[0] + b * point[1] + c,
    d * point[0] + e * point[1] + f,
  ];
}

function solveLinearSystem(matrix, vector) {
  const workingMatrix = matrix.map((row, index) => [...row, vector[index]]);

  for (let pivotIndex = 0; pivotIndex < workingMatrix.length; pivotIndex += 1) {
    const pivotRow = findPivotRow(workingMatrix, pivotIndex);
    if (pivotRow === -1) {
      throw new Error(
        "Control points do not produce a solvable affine transform.",
      );
    }

    if (pivotRow !== pivotIndex) {
      [workingMatrix[pivotIndex], workingMatrix[pivotRow]] = [
        workingMatrix[pivotRow],
        workingMatrix[pivotIndex],
      ];
    }

    const pivot = workingMatrix[pivotIndex][pivotIndex];
    for (
      let columnIndex = pivotIndex;
      columnIndex < workingMatrix[pivotIndex].length;
      columnIndex += 1
    ) {
      workingMatrix[pivotIndex][columnIndex] /= pivot;
    }

    for (let rowIndex = 0; rowIndex < workingMatrix.length; rowIndex += 1) {
      if (rowIndex === pivotIndex) {
        continue;
      }

      const factor = workingMatrix[rowIndex][pivotIndex];
      for (
        let columnIndex = pivotIndex;
        columnIndex < workingMatrix[rowIndex].length;
        columnIndex += 1
      ) {
        workingMatrix[rowIndex][columnIndex] -=
          factor * workingMatrix[pivotIndex][columnIndex];
      }
    }
  }

  return workingMatrix.map((row) => row.at(-1));
}

function buildNormalMatrix(matrix) {
  const width = matrix[0]?.length ?? 0;
  const normalMatrix = Array.from({ length: width }, () =>
    Array(width).fill(0),
  );

  for (const row of matrix) {
    for (let leftIndex = 0; leftIndex < width; leftIndex += 1) {
      for (let rightIndex = 0; rightIndex < width; rightIndex += 1) {
        normalMatrix[leftIndex][rightIndex] +=
          row[leftIndex] * row[rightIndex];
      }
    }
  }

  return normalMatrix;
}

function buildNormalVector(matrix, vector) {
  const width = matrix[0]?.length ?? 0;
  const normalVector = Array(width).fill(0);

  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex];
    for (let columnIndex = 0; columnIndex < width; columnIndex += 1) {
      normalVector[columnIndex] += row[columnIndex] * vector[rowIndex];
    }
  }

  return normalVector;
}

function findPivotRow(matrix, startIndex) {
  for (let rowIndex = startIndex; rowIndex < matrix.length; rowIndex += 1) {
    if (Math.abs(matrix[rowIndex][startIndex]) > Number.EPSILON) {
      return rowIndex;
    }
  }

  return -1;
}
