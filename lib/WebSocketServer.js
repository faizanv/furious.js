var ws = require("ws");
var requests = require("./requests.pb");
var Request = requests.Request;
var EmptyArrayRequest = requests.EmptyArrayRequest;
var DataArrayRequest = requests.DataArrayRequest;
var ConstArrayRequest = requests.ConstArrayRequest;
var LinspaceRequest = requests.LinspaceRequest;
var ReshapeRequest = requests.ReshapeRequest;
var RepeatRequest = requests.RepeatRequest;
var DeallocateRequest = requests.DeallocateRequest;
var FetchRequest = requests.FetchRequest;
var BinaryOperationRequest = requests.BinaryOperationRequest;
var BinaryConstOperationRequest = requests.BinaryConstOperationRequest;
var UnaryOperationRequest = requests.UnaryOperationRequest;
var ReductionRequest = requests.ReductionRequest;
var AxisReductionRequest = requests.AxisReductionRequest;
var DotOperationRequest = requests.DotOperationRequest;
var responses = require("./responses.pb");
var Response = responses.Response;
var FetchResponse = responses.FetchResponse;
var ErrorResponse = responses.ErrorResponse;
var InitResponse = responses.InitResponse;
var InfoResponse = responses.InfoResponse;
var util = require("./util");
var webclCommon = require("./webcl/WebCLCommon");
var DataType = require("./DataType");
var fs = require("fs");
var nodeWebCL = null;
var nopt = require("nopt");

var dataTypeMap = {};
dataTypeMap[requests.DataType.FLOAT64] = new DataType("f64");
dataTypeMap[requests.DataType.FLOAT32] = new DataType("f32");

function ConnectionContext(options) {
	options = options || {};
	nodeWebCL = webclCommon.initWebCL();
	var binaryKernelsSource = fs.readFileSync(__dirname + "/webcl/binaryKernels.cl", "utf8");
	var unaryKernelsSource = fs.readFileSync(__dirname + "/webcl/unaryKernels.cl", "utf8");
	var reductionKernelsSource = fs.readFileSync(__dirname + "/webcl/reductionKernels.cl", "utf8");
	var axisReductionKernelsSource = fs.readFileSync(__dirname + "/webcl/axisReductionKernels.cl", "utf8");
	var productKernelsSource = fs.readFileSync(__dirname + "/webcl/productKernels.cl", "utf8");
	var utilKernelsSource = fs.readFileSync(__dirname + "/webcl/utilKernels.cl", "utf8");
	var solveTriangularKernelSource = fs.readFileSync(__dirname + "/webcl/solveTriangularKernel.cl", "utf8");
	var source = binaryKernelsSource + unaryKernelsSource +
		reductionKernelsSource + axisReductionKernelsSource +
		productKernelsSource + utilKernelsSource + solveTriangularKernelSource;

	this.asyncCallbacks = true;
	this.idMap = {};
	this.clContext = new nodeWebCL.WebCLContext();
	var deviceName = options.device;
	if (deviceName) {
		var deviceIndex = webclCommon.availableDevicesDescriptions.indexOf(deviceName);
		if (deviceIndex === -1) {
			throw new Error("Invalid NodeWebCL device name: " + deviceName);
		}
		this.device = webclCommon.availableDevices[deviceIndex];
	} else {
		var deviceIndex = webclCommon.getDefaultDeviceIndex();
		if (deviceIndex < 0) {
			throw new Error("No Suitable WebCL device found");
		}
		this.device = webclCommon.availableDevices[deviceIndex];
	}
	this.device.enableExtension("KHR_fp64");
	this.deviceInfo = {
		deviceClass: webclCommon.classifyDevice(this.device),
		localMemorySize: this.device.getInfo(nodeWebCL.DEVICE_LOCAL_MEM_SIZE),
		maxComputeUnits: this.device.getInfo(nodeWebCL.DEVICE_MAX_COMPUTE_UNITS),
		maxWorkGroupSize: this.device.getInfo(nodeWebCL.DEVICE_MAX_WORK_GROUP_SIZE),
		maxWorkItemSizes: this.device.getInfo(nodeWebCL.DEVICE_MAX_WORK_ITEM_SIZES)
	};
	this.context = nodeWebCL.createContext(this.device);
	this.queue = this.context.createCommandQueue(this.device);
	this.program = this.context.createProgram(source);
	this.program.build();
	this.kernels = webclCommon.createKernels(this.program);
}

ConnectionContext.prototype.createEmptyArray = function(requestId, idOut, shape, dataType) {
	if (idOut in this.idMap) {
		console.error("Empty Array: Invalid ID");
		return;
	}
	dataType = util.checkDataType(dataType);
	var length = util.computeLength(shape);
	var buffer = this.context.createBuffer(nodeWebCL.MEM_READ_WRITE, dataType.size * length);
	var arrayOut = {
		buffer: buffer,
		shape: shape,
		length: length,
		dataType: dataType
	};
	this.idMap[idOut] = arrayOut;
};

ConnectionContext.prototype.createDataArray = function(requestId, idOut, shape, dataType, dataBuffer) {
	if (idOut in this.idMap) {
		console.error("Error: invalid output ID in CREATE_DATA_ARRAY request");
		return;
	}
	dataType = util.checkDataType(dataType);
	var buffer = this.context.createBuffer(nodeWebCL.MEM_READ_WRITE, dataBuffer.byteLength);
	// TODO: use non-blocking write
	this.queue.enqueueWriteBuffer(buffer, true, 0, dataBuffer.byteLength, dataBuffer);
	var arrayOut = {
		buffer: buffer,
		shape: shape,
		length: util.computeLength(shape),
		dataType: dataType
	};
	this.idMap[idOut] = arrayOut;
};

ConnectionContext.prototype.createConstArray = function(requestId, idOut, shape, dataType, fillValue) {
	if (idOut in this.idMap) {
		console.error("Const Array: Invalid idOut");
		return;
	}
	dataType = util.checkDataType(dataType);
	var length = util.computeLength(shape);
	var buffer = this.context.createBuffer(nodeWebCL.MEM_READ_WRITE, dataType.size * length);
	var kernel = this.kernels.set[dataType.type];
	kernel.setArg(0, new Uint32Array([length]));
	kernel.setArg(1, buffer);
	kernel.setArg(2, new dataType.arrayType([fillValue]));
	this.queue.enqueueNDRangeKernel(kernel, 1, null, [length], null);
	var arrayOut = {
		buffer: buffer,
		shape: shape,
		length: length,
		dataType: dataType
	};

	this.idMap[idOut] = arrayOut;

};

ConnectionContext.prototype.createIdentityMatrix = function(requestId, idOut, rows, columns, diagonal, dataType) {
    if (idOut in this.idMap) {
       console.error("Identity Matrix Error: Invalid idOut");
       return;
    }
    dataType = util.checkDataType(dataType);
	var buffer = this.context.createBuffer(nodeWebCL.MEM_READ_WRITE, dataType.size * rows * columns);
    var kernel = this.kernels.eye[dataType.type];
    kernel.setArg(0, new Uint32Array([rows]));
    kernel.setArg(1, new Uint32Array([columns]));
    kernel.setArg(2, new Uint32Array([diagonal]));
    kernel.setArg(3, buffer);
    this.queue.enqueueNDRangeKernel(kernel, 2, null, [rows, columns], null);
    var arrayOut = {
        buffer: buffer,
        shape: [rows, columns],
        length: rows*columns,
        dataType: dataType
    };

    this.idMap[idOut] = arrayOut;
};

ConnectionContext.prototype.linspace = function(requestId, idOut, start, stop, samples, closed, dataType) {
	if (idOut in this.idMap) {
		console.error("Error: invalid output ID in LINSPACE request");
		return;
	}
	if (!isFinite(start)) {
		console.error("Error: start is not a real number in LINSPACE request");
		return;
	}
	if (!isFinite(stop)) {
		console.error("Error: stop is not a real number in LINSPACE request");
		return;
	}
	if (samples === 0) {
		console.error("Error: the number of samples is zero in LINSPACE request");
		return;
	} else if (closed && (samples === 1)) {
		console.error("Error: not enough samples for a closed interval in LINSPACE request");
		return;
	}

	dataType = util.checkDataType(dataType);
	var buffer = this.context.createBuffer(nodeWebCL.MEM_READ_WRITE, samples * dataType.size);

	var range = stop - start;
	var n = (closed) ? samples - 1 : samples;
	var step = range / n;

	var kernel = this.kernels.linspace[dataType.type];
	kernel.setArg(0, new Uint32Array([samples]));
	kernel.setArg(1, buffer);
	kernel.setArg(2, new dataType.arrayType([start]));
	kernel.setArg(3, new dataType.arrayType([step]));
	this.queue.enqueueNDRangeKernel(kernel, 1, null, [samples], null);

	var arrayOut = {
		buffer: buffer,
		shape: new Uint32Array([samples]),
		length: samples,
		dataType: dataType
	};
	this.idMap[idOut] = arrayOut;
};

ConnectionContext.prototype.reshape = function(requestId, idA, idOut, shapeOut) {
	var array = this.idMap[Math.abs(idA)];
	if (typeof array === "undefined") {
		console.error("Reshape Error: Invalid input ID");
		return;
	}
	if (array.length !== util.computeLength(shapeOut)) {
		console.error("Reshape Error: Incompatible length");
		return;
	}
	var arrayOut = this.idMap[idOut];
	if (typeof arrayOut !== "undefined") {
		if (arrayOut.length !== array.length) {
			console.error("Reshape Error: Incompatible Length");
			return;
		}
		if (!arrayOut.dataType.equals(array.dataType)) {
			console.error("Reshape Error: Incompatible data type");
			return;
		}

		arrayOut.shape = shapeOut;

		if (arrayOut !== array) {
			this.queue.enqueueCopyBuffer(array.buffer, arrayOut.buffer, 0, 0, arrayOut.dataType.size * arrayOut.length);
		}
		if (idA < 0) {
			this.deallocate(requestId, -idA);
		}
	} else {
		var buffer = this.context.createBuffer(nodeWebCL.MEM_READ_WRITE, array.length * array.dataType.size);
		this.queue.enqueueCopyBuffer(array.buffer, buffer, 0, 0, array.length * array.dataType.size);
		arrayOut = {
			buffer: buffer,
			shape: shapeOut,
			length: array.length,
			dataType: array.dataType
		};
		this.idMap[idOut] = arrayOut;
	}
	if (idA < 0) {
		this.deallocate(requestId, -idA);
	}

};

ConnectionContext.prototype.repeat = function(requestId, idA, idOut, axis, repeats) {
	var arrayA = this.idMap[Math.abs(idA)];
	if (typeof arrayA === "undefined") {
		console.error("Repeat Error: Array A is not valid");
		return;
	}
	if (axis >= arrayA.length) {
		console.error("Repeat Error: Invalid axis");
		return;
	}
	if (repeats < 2) {
		console.error("Repeat Error: Invalid repeat count");
		return;
	}

	var shapeOut = arrayA.shape.slice(0);
	shapeOut[axis] *= repeats;

	var arrayOut = this.idMap[Math.abs(idOut)];

	if (typeof arrayOut !== "undefined") {
		try {
			util.checkShapesCompatibility(arrayOut.shape, shapeOut);
			util.checkDataTypesCompatibility(arrayA.dataType, arrayOut.dataType);
		} catch (e) {
			console.error("Repeat Error: data types or shapes not compatible");
			return;
		}
	} else {
		var length = util.computeLength(shapeOut);
		var bufferOut = this.context.createBuffer(nodeWebCL.MEM_READ_WRITE, arrayA.dataType.size * length);
		arrayOut = {
			buffer: bufferOut,
			shape: shapeOut,
			length: length,
			dataType: arrayA.dataType
		};
	}
	var outerStride = util.computeOuterStride(arrayA.shape, axis);
	var innerStride = util.computeInnerStride(arrayA.shape, axis);
	var expansionDim = arrayA.shape[axis];
	var kernel = this.kernels.repeat[arrayA.dataType.type];
	kernel.setArg(0, new Uint32Array([expansionDim]));
	kernel.setArg(1, new Uint32Array([innerStride]));
	kernel.setArg(2, new Uint32Array([repeats]));
	kernel.setArg(3, arrayA.buffer);
	kernel.setArg(4, arrayOut.buffer);
	this.queue.enqueueNDRangeKernel(kernel, 3, null, [outerStride, expansionDim, innerStride], null);

	this.idMap[idOut] = arrayOut;

	if (idA < 0) {
		this.deallocate(requestId, -idA);
	}

};

ConnectionContext.prototype.deallocate = function(requestId, idA) {
	var arrayA = this.idMap[Math.abs(idA)];
	if (typeof arrayA === "undefined") {
		console.error("Error: invalid input ID in deallocate");
		return;
	}
	arrayA.buffer.release();
	delete this.idMap[Math.abs(idA)];
};

ConnectionContext.prototype.fetch = function(requestId, idA) {
	var arrayA = this.idMap[Math.abs(idA)];
	if (typeof arrayA === "undefined") {
		console.error("Error: invalid input ID in fetch");
		return null;
	}

	var dataBuffer = new arrayA.dataType.arrayType(arrayA.length);
	// TODO: use non-blocking read
	this.queue.enqueueReadBuffer(arrayA.buffer, true, 0, dataBuffer.byteLength, dataBuffer);

	var response = new Response();
	response.id = requestId;
	response.type = Response.Type.FETCH;
	var fetchResponse = new FetchResponse();
	fetchResponse.dataBuffer = dataBuffer.buffer;
	response.fetchResponse = fetchResponse;
	var message = response.encodeAB();

	if (idA < 0) {
		arrayA.buffer.release();
		delete this.idMap[-idA];
	}

	return message;
};

ConnectionContext.prototype.barrier = function(requestId) {
	var response = new Response();
	response.id = requestId;
	response.type = Response.Type.BARRIER;
	var message = response.encodeAB();
	return message;
};

ConnectionContext.prototype.binaryOperation = function(requestId, type, idA, idB, idOut) {
	var arrayA = this.idMap[Math.abs(idA)];
	var arrayB = this.idMap[Math.abs(idB)];
	if (typeof arrayA === "undefined") {
		console.error("Binary Operation Error: Array A is not valid");
		return;
	}
	if (typeof arrayB === "undefined") {
		console.error("Binary Operation Error: Array B is not valid");
		return;
	}

	try {
		util.checkDataTypesCompatibility(arrayA.dataType, arrayB.dataType);
		util.checkShapesCompatibility(arrayA.shape, arrayB.shape);
	} catch (e) {
		console.error("Binary Operation Error: DataType or Shape incompatible");
		return;
	}

	var bufferOut = this.context.createBuffer(nodeWebCL.MEM_READ_WRITE, arrayA.dataType.size * arrayA.length);
	var arrayOut = {
		buffer: bufferOut,
		shape: arrayA.shape,
		length: arrayA.length,
		dataType: arrayA.dataType
	};
	if (type === 0) {
		this.add(arrayA, arrayB, arrayOut, idOut);
	} else if (type === 1) {
		this.sub(arrayA, arrayB, arrayOut, idOut);
	} else if (type === 2) {
		this.mul(arrayA, arrayB, arrayOut, idOut);
	} else if (type === 3) {
		this.div(arrayA, arrayB, arrayOut, idOut);
	}
	if (idA < 0) {
		this.deallocate(requestId, -idA);
	}
	if (idB < 0) {
		this.deallocate(requestId, -idB);
	}
};

ConnectionContext.prototype.add = function(a, b, out, idOut) {
	var kernel = this.kernels.add[a.dataType.type];
	kernel.setArg(0, new Uint32Array([a.length]));
	kernel.setArg(1, a.buffer);
	kernel.setArg(2, b.buffer);
	kernel.setArg(3, out.buffer);
	this.queue.enqueueNDRangeKernel(kernel, 1, null, [a.length], null);
	this.idMap[idOut] = out;
};

ConnectionContext.prototype.sub = function(a, b, out, idOut) {
	var kernel = this.kernels.sub[a.dataType.type];
	kernel.setArg(0, new Uint32Array([a.length]));
	kernel.setArg(1, a.buffer);
	kernel.setArg(2, b.buffer);
	kernel.setArg(3, out.buffer);
	this.queue.enqueueNDRangeKernel(kernel, 1, null, [a.length], null);
	this.idMap[idOut] = out;
};

ConnectionContext.prototype.mul = function(a, b, out, idOut) {
	var kernel = this.kernels.mul[a.dataType.type];
	kernel.setArg(0, new Uint32Array([a.length]));
	kernel.setArg(1, a.buffer);
	kernel.setArg(2, b.buffer);
	kernel.setArg(3, out.buffer);
	this.queue.enqueueNDRangeKernel(kernel, 1, null, [a.length], null);
	this.idMap[idOut] = out;
};

ConnectionContext.prototype.div = function(a, b, out, idOut) {
		var kernel = this.kernels.div[a.dataType.type];
		kernel.setArg(0, new Uint32Array([a.length]));
		kernel.setArg(1, a.buffer);
		kernel.setArg(2, b.buffer);
		kernel.setArg(3, out.buffer);
		this.queue.enqueueNDRangeKernel(kernel, 1, null, [a.length], null);
		this.idMap[idOut] = out;
};

ConnectionContext.prototype.binaryConstOperation = function(requestId, type, idA, valueB, idOut) {
	var arrayA = this.idMap[Math.abs(idA)];
	if (typeof arrayA === "undefined") {
		console.error("Binary Const Operation Error: Array A is not valid");
		return;
	}

	var bufferOut = this.context.createBuffer(nodeWebCL.MEM_READ_WRITE, arrayA.dataType.size * arrayA.length);
	var arrayOut = {
		buffer: bufferOut,
		shape: arrayA.shape,
		length: arrayA.length,
		dataType: arrayA.dataType
	};

	if (type === 0) {
		this.addc(arrayA, valueB, arrayOut, idOut);
	} else if (type === 1) {
		this.subc(arrayA, valueB, arrayOut, idOut);
	} else if (type === 2) {
		this.subrc(arrayA, valueB, arrayOut, idOut);
	} else if (type === 3) {
		this.mulc(arrayA, valueB, arrayOut, idOut);
	} else if (type === 4) {
		this.divc(arrayA, valueB, arrayOut, idOut);
	} else if (type === 5) {
		this.divrc(arrayA, valueB, arrayOut, idOut);
	}

	if (idA < 0) {
		this.deallocate(requestId, -idA);
	}
};

ConnectionContext.prototype.addc = function(a, b, out, idOut) {
	var kernel = this.kernels.addc[a.dataType.type];
	kernel.setArg(0, new Uint32Array([a.length]));
	kernel.setArg(1, a.buffer);
	kernel.setArg(2, new a.dataType.arrayType([b]));
	kernel.setArg(3, out.buffer);
	this.queue.enqueueNDRangeKernel(kernel, 1, null, [a.length], null);
	this.idMap[idOut] = out;
};

ConnectionContext.prototype.subc = function(a, b, out, idOut) {
	var kernel = this.kernels.subc[a.dataType.type];
	kernel.setArg(0, new Uint32Array([a.length]));
	kernel.setArg(1, a.buffer);
	kernel.setArg(2, new a.dataType.arrayType([b]));
	kernel.setArg(3, out.buffer);
	this.queue.enqueueNDRangeKernel(kernel, 1, null, [a.length], null);
	this.idMap[idOut] = out;
};

ConnectionContext.prototype.subrc = function(a, b, out, idOut) {
	var kernel = this.kernels.subrc[a.dataType.type];
	kernel.setArg(0, new Uint32Array([a.length]));
	kernel.setArg(1, a.buffer);
	kernel.setArg(2, new a.dataType.arrayType([b]));
	kernel.setArg(3, out.buffer);
	this.queue.enqueueNDRangeKernel(kernel, 1, null, [a.length], null);
	this.idMap[idOut] = out;
};

ConnectionContext.prototype.mulc = function(a, b, out, idOut) {
	var kernel = this.kernels.mulc[a.dataType.type];
	kernel.setArg(0, new Uint32Array([a.length]));
	kernel.setArg(1, a.buffer);
	kernel.setArg(2, new a.dataType.arrayType([b]));
	kernel.setArg(3, out.buffer);
	this.queue.enqueueNDRangeKernel(kernel, 1, null, [a.length], null);
	this.idMap[idOut] = out;
};

ConnectionContext.prototype.divc = function(a, b, out, idOut) {
	var kernel = this.kernels.divc[a.dataType.type];
	kernel.setArg(0, new Uint32Array([a.length]));
	kernel.setArg(1, a.buffer);
	kernel.setArg(2, new a.dataType.arrayType([b]));
	kernel.setArg(3, out.buffer);
	this.queue.enqueueNDRangeKernel(kernel, 1, null, [a.length], null);
	this.idMap[idOut] = out;
};

ConnectionContext.prototype.divrc = function(a, b, out, idOut) {
	var kernel = this.kernels.divrc[a.dataType.type];
	kernel.setArg(0, new Uint32Array([a.length]));
	kernel.setArg(1, a.buffer);
	kernel.setArg(2, new a.dataType.arrayType([b]));
	kernel.setArg(3, out.buffer);
	this.queue.enqueueNDRangeKernel(kernel, 1, null, [a.length], null);
	this.idMap[idOut] = out;
};

ConnectionContext.prototype.unaryOperation = function(requestId, type, idA, idOut) {
	var arrayA = this.idMap[Math.abs(idA)];
	if (typeof arrayA === "undefined") {
		console.error("Unary Operation Error: Array A is not valid");
		return;
	}

	var arrayOut = this.idMap[Math.abs(idOut)];
	if (typeof arrayOut !== "undefined") {
		try {
			util.checkDataTypesCompatibility(arrayA.dataType, arrayOut.dataType);
			util.checkShapesCompatibility(arrayA.shape, arrayOut.shape);
		} catch (e) {
			console.error("Unary Operation Error: DataType or Shape incompatible");
			return;
		}
	} else {
		var bufferOut = this.context.createBuffer(nodeWebCL.MEM_READ_WRITE, arrayA.dataType.size * arrayA.length);
		arrayOut = {
			buffer: bufferOut,
			shape: arrayA.shape,
			length: arrayA.length,
			dataType: arrayA.dataType
		};
	}

	if (type === 0) {
		this.neg(arrayA, arrayOut, idOut);
	} else if (type === 1) {
		this.abs(arrayA, arrayOut, idOut);
	} else if (type === 2) {
		this.exp(arrayA, arrayOut, idOut);
	} else if (type === 3) {
		this.log(arrayA, arrayOut, idOut);
	} else if (type === 4) {
		this.sqrt(arrayA, arrayOut, idOut);
	} else if (type === 5) {
		this.square(arrayA, arrayOut, idOut);
	}

	if (idA < 0) {
		this.deallocate(requestId, -idA);
	}
};

ConnectionContext.prototype.neg = function(a, out, idOut) {
	var kernel = this.kernels.neg[a.dataType.type];
	kernel.setArg(0, new Uint32Array([a.length]));
	kernel.setArg(1, a.buffer);
	kernel.setArg(2, out.buffer);
	this.queue.enqueueNDRangeKernel(kernel, 1, null, [a.length], null);
	this.idMap[idOut] = out;
};

ConnectionContext.prototype.abs = function(a, out, idOut) {
	var kernel = this.kernels.abs[a.dataType.type];
	kernel.setArg(0, new Uint32Array([a.length]));
	kernel.setArg(1, a.buffer);
	kernel.setArg(2, out.buffer);
	this.queue.enqueueNDRangeKernel(kernel, 1, null, [a.length], null);
	this.idMap[idOut] = out;
};

ConnectionContext.prototype.exp = function(a, out, idOut) {
	var kernel = this.kernels.exp[a.dataType.type];
	kernel.setArg(0, new Uint32Array([a.length]));
	kernel.setArg(1, a.buffer);
	kernel.setArg(2, out.buffer);
	this.queue.enqueueNDRangeKernel(kernel, 1, null, [a.length], null);
	this.idMap[idOut] = out;
};

ConnectionContext.prototype.log = function(a, out, idOut) {
	var kernel = this.kernels.log[a.dataType.type];
	kernel.setArg(0, new Uint32Array([a.length]));
	kernel.setArg(1, a.buffer);
	kernel.setArg(2, out.buffer);
	this.queue.enqueueNDRangeKernel(kernel, 1, null, [a.length], null);
	this.idMap[idOut] = out;
};

ConnectionContext.prototype.sqrt = function(a, out, idOut) {
	var kernel = this.kernels.sqrt[a.dataType.type];
	kernel.setArg(0, new Uint32Array([a.length]));
	kernel.setArg(1, a.buffer);
	kernel.setArg(2, out.buffer);
	this.queue.enqueueNDRangeKernel(kernel, 1, null, [a.length], null);
	this.idMap[idOut] = out;
};

ConnectionContext.prototype.square = function(a, out, idOut) {
	var kernel = this.kernels.square[a.dataType.type];
	kernel.setArg(0, new Uint32Array([a.length]));
	kernel.setArg(1, a.buffer);
	kernel.setArg(2, out.buffer);
	this.queue.enqueueNDRangeKernel(kernel, 1, null, [a.length], null);
	this.idMap[idOut] = out;
};

ConnectionContext.prototype.reductionOperation = function(requestId, type, idA, idOut) {
	var arrayA = this.idMap[Math.abs(idA)];
	var arrayOut = this.idMap[Math.abs(idOut)];
	if (typeof arrayA === "undefined") {
		console.error("Reduction Error: invalid array");
		return;
	}
	if (typeof arrayOut === "undefined") {
		var bufferOut = this.context.createBuffer(nodeWebCL.MEM_READ_WRITE, arrayA.dataType.size);
		arrayOut = {
			buffer: bufferOut,
			shape: [],
			length: 1,
			dataType: arrayA.dataType
		};
	} else {
		try {
			util.checkShapesCompatibility([], arrayOut.shape);
			util.checkDataTypesCompatibility(arrayA.dataType, arrayOut.dataType);
		} catch (e) {
			console.error("Reduction Error: incompatible data types or shapes");
			return;
		}
	}

	var maxWorkItemsPerCU = Math.min(
		Math.min(this.deviceInfo.maxWorkGroupSize, this.deviceInfo.maxWorkItemSizes[0]),
			this.deviceInfo.localMemorySize / arrayA.dataType.size);
	console.log("MAX WORK ITEMS PER CU: " + maxWorkItemsPerCU);
	var parallelisationThreshold = 16;
	var kernel;
	if (type === 0) {
		kernel = this.kernels.sum[arrayA.dataType.type];
	} else if (type === 1) {
		kernel = this.kernels.min[arrayA.dataType.type];
	} else if (type === 2) {
		kernel = this.kernels.max[arrayA.dataType.type];
	}

	if (arrayA.length < maxWorkItemsPerCU * parallelisationThreshold) {
		kernel.setArg(0, new Uint32Array([arrayA.length]));
		kernel.setArg(1, arrayA.buffer);
		kernel.setArg(2, new Uint32Array([maxWorkItemsPerCU * arrayA.dataType.size]));
		kernel.setArg(3, arrayOut.buffer);
		this.queue.enqueueNDRangeKernel(kernel, 1, null, [maxWorkItemsPerCU], [maxWorkItemsPerCU], null);
	} else {
		var maxComputeUnits = this.deviceInfo.maxComputeUnits;
		var workGroupSizeMultiple = kernel.getWorkGroupInfo(this.device, nodeWebCL.KERNEL_PREFERRED_WORK_GROUP_SIZE_MULTIPLE);
		var tempBuffer = this.context.createBuffer(nodeWebCL.MEM_READ_WRITE, maxComputeUnits * arrayA.dataType.size);

		kernel.setArg(0, new Uint32Array([arrayA.length]));
		kernel.setArg(1, arrayA.buffer);
		kernel.setArg(2, new Uint32Array([maxWorkItemsPerCU * arrayA.dataType.size]));
		kernel.setArg(3, tempBuffer);
		this.queue.enqueueNDRangeKernel(kernel, 1, null,
			[maxWorkItemsPerCU * maxComputeUnits],
			[maxWorkItemsPerCU]);
		var workGroupSize = Math.min(maxWorkItemsPerCU,
			util.roundUp(maxComputeUnits, workGroupSizeMultiple));
		kernel.setArg(0, new Uint32Array([maxComputeUnits]));
		kernel.setArg(1, tempBuffer);
		kernel.setArg(2, new Uint32Array([workGroupSize * arrayA.dataType.size]));
		kernel.setArg(3, arrayOut.buffer);
		/* Important: use only one work group */
		this.queue.enqueueNDRangeKernel(kernel, 1, null,
			[workGroupSize],
			[workGroupSize]);

		tempBuffer.release();

		this.idMap[idOut] = arrayOut;

		if (idA < 0) {
			this.deallocate(requestId, -idA);
		}
	}
};

ConnectionContext.prototype.axisReductionOperation = function(requestId, type, idA, axis, idOut) {
	var arrayA = this.idMap[Math.abs(idA)];
	var arrayOut = this.idMap[Math.abs(idOut)];
	if (typeof arrayA === "undefined") {
		console.error("Axis Reduction Error: Invalid array");
		return;
	}
	axis = util.checkAxis(axis, arrayA.shape.length);
	var shapeOut = util.computeAxisReductionOutShape(arrayA.shape, axis);
	var lengthOut = util.computeLength(shapeOut);
	if (typeof arrayOut === "undefined") {
		var bufferOut = this.context.createBuffer(nodeWebCL.MEM_READ_WRITE, arrayA.dataType.size * lengthOut);
		arrayOut = {
			buffer: bufferOut,
			shape: shapeOut,
			length: lengthOut,
			dataType: arrayA.dataType
		};
	} else {
		try {
			util.checkDataTypesCompatibility(arrayA.dataType, arrayOut.dataType);
			util.checkShapesCompatibility(arrayA.shape, arrayOut.shape);
		} catch (e) {
			console.error("Reduction Error: Shape or Datatypes incompatible");
			return;
		}
	}

	var outerStride = util.computeOuterStride(arrayA.shape, axis);
	var reductionDim = arrayA.shape[axis];
	var innerStride = util.computeInnerStride(arrayA.shape, axis);
	var kernel;
	if (type === 0) {
		kernel = this.kernels.asum[arrayA.dataType.type];
	} else if (type === 1) {
		kernel = this.kernels.amin[arrayA.dataType.type];
	} else if (type === 2) {
		kernel = this.kernels.amax[arrayA.dataType.type];
	}
	kernel.setArg(0, new Uint32Array([reductionDim]));
	kernel.setArg(1, arrayA.buffer);
	kernel.setArg(2, arrayOut.buffer);

	this.queue.enqueueNDRangeKernel(kernel, 2, null, [outerStride, innerStride], null);

	this.idMap[idOut] = arrayOut;

	if (idA < 0) {
		this.deallocate(requestId, -idA);
	}
};

ConnectionContext.prototype.dot = function(requestId, idA, idB, idOut) {
	var arrayA = this.idMap[Math.abs(idA)];
	var arrayB = this.idMap[Math.abs(idB)];
	if (typeof arrayA === "undefined") {
		console.error("Dot Error: Array A invalid");
		return;
	}
	if (typeof arrayB === "undefined") {
		console.error("Dot Error: Array B invalid");
		return;
	}

	var aAxis = Math.max(arrayA.shape.length - 1, 0);
	var bAxis = Math.max(arrayB.shape.length - 2, 0);
	var reductionDim = arrayA.shape[aAxis];
	if (reductionDim !== arrayB.shape[bAxis]) {
		console.error("Dot Error: Incompatible reduction dimensions");
		return;
	}
	var shapeOut = [], strideA = 1, outerStrideB = 1, innerStrideB = 1;
	for (var i = 0; i < aAxis; i++) {
		shapeOut.push(arrayA.shape[i]);
		strideA *= arrayA.shape[i];
	}
	for (var i = 0; i < arrayB.shape.length; i++) {
		var dim = arrayB.shape[i];
		if (i < bAxis) {
			outerStrideB *= dim;
			shapeOut.push(dim);
		} else if (i > bAxis) {
			innerStrideB *= dim;
			shapeOut.push(dim);
		}
	}
	var length = util.computeLength(shapeOut);
	var bufferOut = this.context.createBuffer(nodeWebCL.MEM_READ_WRITE, length * arrayA.dataType.size);
	var arrayOut = {
		buffer: bufferOut,
		shape: shapeOut,
		length: length,
		dataType: arrayA.dataType
	};
	var kernel = this.kernels.dot[arrayA.dataType.type];
	kernel.setArg(0, new Uint32Array([reductionDim]));
	kernel.setArg(1, arrayA.buffer);
	kernel.setArg(2, arrayB.buffer);
	kernel.setArg(3, arrayOut.buffer);
	this.queue.enqueueNDRangeKernel(kernel, 3, null, [strideA, outerStrideB, innerStrideB], null);

	this.idMap[idOut] = arrayOut;

	if (idA < 0) {
		this.deallocate(requestId, -idA);
	}
	if (idB < 0) {
		this.deallocate(requestId, -idB);
	}
};

ConnectionContext.prototype.choleskyDecomposition = function(requestId, idA, aType, idOut) {
    var arrayA = idMap[Math.abs(idA)];
    if (typeof arrayA === "undefined") {
        console.error("Cholesky Error: Invalid input array");
        return;
    }
    if (arrayA.shape.length !== 2) {
        console.error("Cholesky Error: Invalid array shape");
        return;
    }
    if (arrayA.shape[0] !== arrayA.shape[1]) {
        console.error("Cholesky Error: Array is not square");
        return;
    }
    var arrayOut = idMap[idOut];
    if (typeof arrayOut !== "undefined") {
        try {
            util.arrayEquals(arrayA.shape, arrayOut.shape);
        } catch (e) {
            console.error("Cholesky Error: out array has incompatible shape");
            return;
        }
        if (!arrayA.dataType.equals(arrayOut.dataType)) {
            console.error("Cholesky Error: out array has incompatible data type");
            return;
        }
    } else {
        var length = util.computeLength(arrayA);
        var buffer = this.context.createBuffer(nodeWebCL.MEM_READ_WRITE, length * arrayA.dataType.size);
        arrayOut = {
            buffer: buffer,
            shape: arrayA.shape,
            length: length,
            dataType: arrayA.dataType
        };
    }
    idMap[idOut] = arrayOut;
};

ConnectionContext.prototype.solveTriangular = function(requestId, idA, aType, aTransposition, unitDiagonal, idY, idX) {
    var arrayA = this.idMap[Math.abs(idA)];
    if (typeof arrayA === "undefined") {
        console.error("Solve Triangular Error: Invalid Input ID");
        return;
    }
    if (arrayA.shape.length !== 2) {
        console.error("Solve Triangular Error: Invalid shape");
        return;
    }
    if (arrayA.shape[0] !== arrayA.shape[1]) {
        console.error("Solve Triangular Error: Invalid Shape");
        return;
    }
    var arrayY = this.idMap[Math.abs(idY)];
    if (typeof arrayY === "undefined") {
        console.error("Solve Triangular Error: Invalid Y ID");
        return;
	}
	if ((arrayY.shape.length !== 1) && (arrayY.shape.length !== 2)) {
        console.error("Solve Triangular Error: Invalid Shape");
        return;
	}
	if (arrayA.shape[0] !== arrayY.shape[0]) {
        console.error("Solve Triangular Error: Invalid Shape");
        return;
	}
	if (!arrayA.dataType.equals(arrayY.dataType)) {
        console.error("Solve Triangular Error: Invalid Data Type");
        return;
	}

    var arrayX = this.idMap[idX];
    if (typeof arrayX === "undefined") {
        var buffer = this.context.createBuffer(nodeWebCL.MEM_READ_WRITE, arrayY.length * arrayY.dataType.size);
		this.queue.enqueueCopyBuffer(arrayY.buffer, buffer, 0, 0, arrayY.length * arrayY.dataType.size);
        arrayX = {
            buffer: buffer,
            shape: arrayY.shape,
            length: arrayY.length,
            dataType: arrayY.dataType
        };
    } else {
        if (!util.arrayEquals(arrayX.shape, arrayY.shape)) {
            console.error("Solve Triangular Error: Invalid X and Y Shape");
            return;
		}
		if (!arrayX.dataType.equals(arrayY.dataType)) {
            console.error("Solve Triangular Error: Invalid X and Y DataType");
            return;
		}
    }
	if (aType === 1) {
		var kernel = this.kernels.solveTriangular[arrayA.dataType.type];
		kernel.setArg(0, arrayA.buffer);
		kernel.setArg(1, arrayY.buffer);
		kernel.setArg(2, arrayX.buffer);
		kernel.setArg(3, new Uint32Array([arrayY.shape[1]]));
		kernel.setArg(4, new Uint32Array([arrayA.shape[0]]));
		this.queue.enqueueNDRangeKernel(kernel, 1, null, [arrayY.shape[1]], null);
	} else {
		return;
	}

	this.idMap[idX] = arrayX;
    

};

var commandLineOptions = {
	"host" : String,
	"path": String,
	"port" : Number
};
var commandLineShorthands = {
	"h": ["--host"],
	"p": ["--port"]
};
var commandLineArguments = nopt(commandLineOptions, commandLineShorthands, process.argv, 2);
var port = commandLineArguments.port || 8081;
var host = commandLineArguments.host || "localhost";
var path = commandLineArguments.path;

var server = ws.createServer({port: port, host: host, path: path});
server.on("connection", function(connection) {
	connection.connectionContext = new ConnectionContext();
	console.info("INFO: CONNECTED");

		connection.on("message", function (message, flags) {
			var request = Request.decode(message);
			switch (request.type) {
				case Request.Type.EMPTY_ARRAY:
					var emptyArrayRequest = request.emptyArrayRequest;
					connection.connectionContext.createEmptyArray(request.id,
						emptyArrayRequest.idOut,
						emptyArrayRequest.shape,
						dataTypeMap[emptyArrayRequest.dataType]);
					break;
				case Request.Type.DATA_ARRAY:
					var dataArrayRequest = request.dataArrayRequest;
					connection.connectionContext.createDataArray(request.id,
						dataArrayRequest.idOut,
						dataArrayRequest.shape,
						dataTypeMap[dataArrayRequest.dataType],
						dataArrayRequest.dataBuffer.toArrayBuffer());
					break;
				case Request.Type.CONST_ARRAY:
					var constArrayRequest = request.constArrayRequest;
					connection.connectionContext.createConstArray(request.id,
						constArrayRequest.idOut,
						constArrayRequest.shape,
						dataTypeMap[constArrayRequest.dataType],
						constArrayRequest.fillValue);
					break;
				case Request.Type.IDENTITY_MATRIX:
                    var identityMatrixRequest = request.identityMatrixRequest;
                    connection.connectionContext.createIdentityMatrix(request.id,
                        identityMatrixRequest.idOut,
                        identityMatrixRequest.rows,
                        identityMatrixRequest.columns,
                        identityMatrixRequest.diagonal,
                        dataTypeMap[identityMatrixRequest.dataType]);
					break;
				case Request.Type.LINSPACE:
					var linspaceRequest = request.linspaceRequest;
					connection.connectionContext.linspace(request.id,
						linspaceRequest.idOut,
						linspaceRequest.start,
						linspaceRequest.stop,
						linspaceRequest.samples,
						linspaceRequest.closed,
						dataTypeMap[linspaceRequest.dataType]);
					break;
				case Request.Type.RESHAPE:
					var reshapeRequest = request.reshapeRequest;
					connection.connectionContext.reshape(request.id,
						reshapeRequest.idA,
						reshapeRequest.idOut,
						reshapeRequest.shapeOut);
					break;
				case Request.Type.REPEAT:
					var repeatRequest = request.repeatRequest;
					connection.connectionContext.repeat(request.id,
						repeatRequest.idA,
						repeatRequest.idOut,
						repeatRequest.axis,
						repeatRequest.repeats);
					break;
				case Request.Type.DEALLOCATE:
					var deallocateRequest = request.deallocateRequest;
					connection.connectionContext.deallocate(request.id,
						deallocateRequest.idA);
					break;
				case Request.Type.FETCH:
					var fetchRequest = request.fetchRequest;
					var response = connection.connectionContext.fetch(request.id,
						fetchRequest.idA);
						if (response !== null) {
						connection.send(response, {binary: true});
					}
					break;
				case Request.Type.BARRIER:
					var response = connection.connectionContext.barrier(request.id);
					if (response !== null) {
						connection.send(response, {binary: true});
					}
					break;
				case Request.Type.INFO:
					break;
				case Request.Type.BINARY_OPERATION:
					var binaryOperationRequest = request.binaryOperationRequest;
					connection.connectionContext.binaryOperation(request.id,
						binaryOperationRequest.type,
						binaryOperationRequest.idA,
						binaryOperationRequest.idB,
						binaryOperationRequest.idOut);
					break;
				case Request.Type.BINARY_CONST_OPERATION:
					var binaryConstOperationRequest = request.binaryConstOperationRequest;
					connection.connectionContext.binaryConstOperation(request.id,
						binaryConstOperationRequest.type,
						binaryConstOperationRequest.idA,
						binaryConstOperationRequest.valueB,
						binaryConstOperationRequest.idOut);
					break;
				case Request.Type.UNARY_OPERATION:
					var unaryOperationRequest = request.unaryOperationRequest;
					connection.connectionContext.unaryOperation(request.id,
						unaryOperationRequest.type,
						unaryOperationRequest.idA,
						unaryOperationRequest.idOut);
					break;
				case Request.Type.REDUCTION_OPERATION:
					/*var reductionOperationRequest = request.reductionRequest;
					connection.connectionContext.reductionOperation(request.id,
						reductionOperationRequest.type,
						reductionOperationRequest.idA,
						reductionOperationRequest.idOut);*/
					break;
				case Request.Type.AXIS_REDUCTION_OPERATION:
					var axisReductionRequest = request.axisReductionRequest;
					connection.connectionContext.axisReductionOperation(request.id,
						axisReductionRequest.type,
						axisReductionRequest.idA,
						axisReductionRequest.axis,
						axisReductionRequest.idOut);
					break;
				case Request.Type.DOT_OPERATION:
					var dotOperationRequest = request.dotOperationRequest;
					connection.connectionContext.dot(request.id,
						dotOperationRequest.idA,
						dotOperationRequest.idB,
						dotOperationRequest.idOut);
					break;
				case Request.Type.CHOLESKY_DECOMPOSITION:
                    /* var choleskyDecompositionRequest = request.choleskyDecompositionRequest;
                    connection.connectionContext.choleskyDecomposition(request.id,
                        choleskyDecompositionRequest.idA,
                        choleskyDecompositionRequest.aType,
                        choleskyDecompositionRequest.idOut); */
					break;
				case Request.Type.SOLVE_TRIANGULAR:
                    var solveTriangularRequest = request.solveTriangularRequest;
                    connection.connectionContext.solveTriangular(request.id,
                        solveTriangularRequest.idA,
                        solveTriangularRequest.aType,
                        solveTriangularRequest.aTransposition,
                        solveTriangularRequest.unitDiagonal,
                        solveTriangularRequest.idY,
                        solveTriangularRequest.idX);
                    break;

		}
	});
});

