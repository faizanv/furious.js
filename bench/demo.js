var furious = require("../lib/furious.js");
var Benchmark = require("benchmark").Benchmark;

furious.init(function(context) {
	Benchmark("Repeat twice along x-axis in 2-d array", {
		"defer": true,

		"fn": function(deferred) {
			var x = context.ones([100, 100]);
			var y = x.repeat(2, 0);
			context.barrier(function (){
				deferred.resolve();
			});
		},
		"onComplete": function(event) {
			if (typeof window !== "undefined") {
				var output = document.getElementById("output");
				output.appendChild(document.createTextNode(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms"));
				output.appendChild(document.createElement("br"));
			} else {
				console.log(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms");
			}
		}
	}).run();

	Benchmark("Repeat three times along x-axis in 1-d array", {
		"defer": true,

		"fn": function(deferred) {
			var x = context.ones([100, 1], new furious.DataType("f32"));
			var y = x.repeat(3, 0);
			context.barrier(function (){
				deferred.resolve();
			});
		},
		"onComplete": function(event) {
			if (typeof window !== "undefined") {
				var output = document.getElementById("output");
				output.appendChild(document.createTextNode(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms"));
				output.appendChild(document.createElement("br"));
			} else {
				console.log(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms");
			}
		}
	}).run();

	Benchmark("Repeat twice along y-axis in 1-d array", {
		"defer": true,

		"fn": function(deferred) {
			var x = context.ones([1, 100]);
			var y = x.repeat(2, 0);
			context.barrier(function (){
				deferred.resolve();
			});
		},
		"onComplete": function(event) {
			if (typeof window !== "undefined") {
				var output = document.getElementById("output");
				output.appendChild(document.createTextNode(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms"));
				output.appendChild(document.createElement("br"));
			} else {
				console.log(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms");
			}
		}
	}).run();

	Benchmark("Repeat twice along y-axis in 2-d array", {
		"defer": true,

		"fn": function(deferred) {
			var x = context.ones([100, 100]);
			var y = x.repeat(2, 1);
			context.barrier(function (){
				deferred.resolve();
			});
		},
		"onComplete": function(event) {
			if (typeof window !== "undefined") {
				var output = document.getElementById("output");
				output.appendChild(document.createTextNode(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms"));
				output.appendChild(document.createElement("br"));
			} else {
				console.log(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms");
			}
		}
	}).run();

	Benchmark("Repeat twice along z-axis in 2-d array", {
		"defer": true,

		"fn": function(deferred) {
			var x = context.ones([100, 100, 50]);
			var y = x.repeat(2, 2);
			context.barrier(function (){
				deferred.resolve();
			});
		},
		"onComplete": function(event) {
			if (typeof window !== "undefined") {
				var output = document.getElementById("output");
				output.appendChild(document.createTextNode(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms"));
				output.appendChild(document.createElement("br"));
			} else {
				console.log(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms");
			}
		}
	}).run();

	Benchmark("Repeat five times along y-axis in 100x1 array", {
		"defer": true,

		"fn": function(deferred) {
			var x = context.ones([100, 1]);
			var y = x.repeat(5, 1);
			context.barrier(function (){
				deferred.resolve();
			});
		},
		"onComplete": function(event) {
			if (typeof window !== "undefined") {
				var output = document.getElementById("output");
				output.appendChild(document.createTextNode(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms"));
				output.appendChild(document.createElement("br"));
			} else {
				console.log(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms");
			}
		}
	}).run();

	Benchmark("Repeat five times along y-axis in 1x100 array", {
		"defer": true,

		"fn": function(deferred) {
			var x = context.ones([1, 100]);
			var y = x.repeat(5, 1);
			context.barrier(function (){
				deferred.resolve();
			});
		},
		"onComplete": function(event) {
			if (typeof window !== "undefined") {
				var output = document.getElementById("output");
				output.appendChild(document.createTextNode(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms"));
				output.appendChild(document.createElement("br"));
			} else {
				console.log(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms");
			}
		}
	}).run();

	Benchmark("Repeat five times along x-axis in 3-d array", {
		"defer": true,

		"fn": function(deferred) {
			var x = context.ones([1000, 1000, 1000]);
			var y = x.repeat(5, 0);
			context.barrier(function (){
				deferred.resolve();
			});
		},
		"onComplete": function(event) {
			if (typeof window !== "undefined") {
				var output = document.getElementById("output");
				output.appendChild(document.createTextNode(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms"));
				output.appendChild(document.createElement("br"));
			} else {
				console.log(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms");
			}
		}
	}).run();

	Benchmark("Repeat four times along y-axis in 3-d array", {
		"defer": true,

		"fn": function(deferred) {
			var x = context.ones([500, 500, 500]);
			var y = x.repeat(4, 1);
			context.barrier(function (){
				deferred.resolve();
			});
		},
		"onComplete": function(event) {
			if (typeof window !== "undefined") {
				var output = document.getElementById("output");
				output.appendChild(document.createTextNode(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms"));
				output.appendChild(document.createElement("br"));
			} else {
				console.log(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms");
			}
		}
	}).run();

	Benchmark("Repeat four times along y-axis in 3-d array", {
		"defer": true,

		"fn": function(deferred) {
			var x = context.ones([500, 500, 500]);
			var y = x.repeat(4, 1);
			context.barrier(function (){
				deferred.resolve();
			});
		},
		"onComplete": function(event) {
			if (typeof window !== "undefined") {
				var output = document.getElementById("output");
				output.appendChild(document.createTextNode(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms"));
				output.appendChild(document.createElement("br"));
			} else {
				console.log(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms");
			}
		}
	}).run();

	Benchmark("Repeat ten times along x-axis in 1-d array", {
		"defer": true,

		"fn": function(deferred) {
			var x = context.ones([1000, 1, 1]);
			var y = x.repeat(10, 0);
			context.barrier(function (){
				deferred.resolve();
			});
		},
		"onComplete": function(event) {
			if (typeof window !== "undefined") {
				var output = document.getElementById("output");
				output.appendChild(document.createTextNode(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms"));
				output.appendChild(document.createElement("br"));
			} else {
				console.log(this.name + ": " + (this.stats.mean * 1000).toFixed(2) + " ms");
			}
		}
	}).run();


});
