// ==UserScript==
// @name         MooMoo Minimap
// @version      0.1
// @description  MooMoo.io Minimap
// @author       twikou
// @match        *://moomoo.io/*
// @match        *://*.moomoo.io/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=moomoo.io
// @require      https://cdn.jsdelivr.net/npm/msgpack-lite@0.1.26/dist/msgpack.min.js
// @require      https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js
// @grant        GM_addStyle
// ==/UserScript==

(function() {
	'use strict';

	const config = {
		map: {
			width: 14400.0,
			height: 14400.0,
			display: {
				width: 300,
				height: 300,
				resource: {
					wood: { enable: true, color: '#8ecc51', radius: 3 },
					food: { enable: true, color: '#ff3333', radius: 2 },
					stone: { enable: true, color: '#888888', radius: 3 },
					points: { enable: true, color: '#ffee33', radius: 4 }
				}
			},
		},
	};
	const mapResource = [];
	const resourceKey = ["wood", "food", "stone", "points"];

	function drawResource(context, resource) {
		const {x, y, name} = resource;
		const mapWidth = config.map.width;
		const mapHeight = config.map.height;
		const mapDisplayWidth = config.map.display.width;
		const mapDisplayHeight = config.map.display.height;
		const mapX = x/mapWidth*mapDisplayWidth;
		const mapY = y/mapHeight*mapDisplayHeight;
		const resourceConfig = config.map.display.resource[name];
		const color = resourceConfig.color;
		const radius = resourceConfig.radius;

		context.beginPath();
		context.arc(mapX, mapY, radius, 0, 2 * Math.PI);
		context.fillStyle = color;
		context.fill();
		context.strokeStyle = color;
		context.stroke();
	}

	function renderMap(context) {
		_.each(mapResource, function(resource) {
			if (!config.map.display.resource[resource.name].enable) return;
			drawResource(context, resource);
		});
	}
	function handleServerResourcePacket(data) {
		const packetBundle = data[1][0];
		// Each 8 element is 1 packet
		_.each(_.chunk(packetBundle, 8), function(packet) {
			const [sid, x, y, dir, scale, type, item, owner] = packet;
			const name = resourceKey[type];

			// TODO: display item resources
			if (!name) return;

			const resource = {
				sid: sid,
				x: x,
				y: y,
				dir: dir,
				scale: scale,
				type: type,
				name: name,
				item: item,
				owner: owner
			}
			mapResource.push(resource);
		});
	}
	function handleServerPacket(data) {
		switch(data[0]) {
			case 'H':
				handleServerResourcePacket(data);
				break;
		}
	}

	function handleServerMessage(message) {
		const messageDecoded = msgpack.decode(new Uint8Array(message.data));
		handleServerPacket(messageDecoded);
	}

	function addServerListener(socket) {
		socket.addEventListener('message', function(message) {
			handleServerMessage(message);
		});
	}

	// override WebSocket send function
	(function(original) {
		let start = false;
		WebSocket.prototype.send = function() {
			if (!start) {
				start = true;
				addServerListener(this);
			};
			// TODO: Client message
			original.apply(this, arguments);
		}
	})(WebSocket.prototype.send);

	// render map when mapDisplay is cleared
	(function(original){
		CanvasRenderingContext2D.prototype.clearRect = function() {
			original.apply(this, arguments);
			if(this.canvas.id == "mapDisplay") renderMap(this);
		}
	})(CanvasRenderingContext2D.prototype.clearRect);

	function createModal() {
		const wrapper = document.createElement('div');
		wrapper.className = 'modalWrapper';
		wrapper.setAttribute("style", "position: fixed; top: 2rem; left: 2rem; z-index: 9999; display: none;");
		wrapper.innerHTML = `
<div style="background-color: #fff; border-radius: 4px; box-shadow: 0px 7px #c4c4c4; max-width: 200px;">
	<div style="display: flex; align-items: center; position: relative; background-color: #eaeaea; border-bottom: 1px solid #ccc; cursor: move;">
		<div style="margin: 0 0.3rem;">Map Display</div>
		<div style="cursor: pointer; font-size: 20px; margin-right: 0.3rem;">×</div>
	</div>
	<div style="padding: 0.5rem;">
		<div style="display:flex; align-items: center; margin-bottom: 0.3rem;">
			<div data-mod-switch data-item="stone" class="switch" style="margin-right: 0.5rem;">
				<input type="checkbox">
				<span class="slider"></span>
			</div>
			<div>Stone</div>
		</div>
		<div style="display:flex; align-items: center; margin-bottom: 0.3rem;">
			<div data-mod-switch data-item="wood" class="switch" style="margin-right: 0.5rem;">
				<input type="checkbox">
				<span class="slider"></span>
			</div>
			<div>Wood</div>
		</div>
		<div style="display:flex; align-items: center; margin-bottom: 0.3rem;">
			<div data-mod-switch data-item="food" class="switch" style="margin-right: 0.5rem;">
				<input type="checkbox">
				<span class="slider"></span>
			</div>
			<div>Food</div>
		</div>
		<div style="display:flex; align-items: center;">
			<div data-mod-switch data-item="points" class="switch" style="margin-right: 0.5rem;">
				<input type="checkbox">
				<span class="slider"></span>
			</div>
			<div>Gold</div>
		</div>
	</div>
</div>
`;

		// Click on map to show setting
		document.getElementById("mapDisplay").addEventListener("click", () => {
			wrapper.style.display = 'block';
		});

		document.body.appendChild(wrapper);
		const modal = wrapper.firstElementChild;
		const modalHeader = modal.firstElementChild;
		const closeBtn = modalHeader.lastElementChild;

		// Close modal when close button is clicked
		closeBtn.addEventListener('click', () => {
			wrapper.style.display = 'none';
		});

		let isDragging = false;
		let offsetX, offsetY;
		let modalWidth = wrapper.offsetWidth;
		let modalHeight = wrapper.offsetHeight;
		let windowWidth = window.innerWidth;
		let windowHeight = window.innerHeight;

		// Toggle resource enable
		document.querySelectorAll("[data-mod-switch]").forEach(function(element) {
			const item = element.dataset.item;
			element.firstElementChild.checked = config.map.display.resource[item].enable;
			element.addEventListener("click", function(event) {
				const currentSetting = !config.map.display.resource[item].enable;
				config.map.display.resource[item].enable = currentSetting;
				element.firstElementChild.checked = currentSetting;
			});
		});

		modalHeader.addEventListener('mousedown', startDragging);
		modalHeader.addEventListener('mouseup', stopDragging);

		function startDragging(e) {
			isDragging = true;
			offsetX = e.clientX - wrapper.offsetLeft;
			offsetY = e.clientY - wrapper.offsetTop;
			document.addEventListener('mousemove', dragModal);
		}

		function stopDragging() {
			isDragging = false;
			document.removeEventListener('mousemove', dragModal);
		}

		function dragModal(e) {
			if (isDragging) {
				const newX = e.clientX - offsetX;
				const newY = e.clientY - offsetY;

				// Ensure modal does not go past the left edge of the screen
				const leftEdge = Math.max(newX, 0);

				// Ensure modal does not go past the top edge of the screen
				const topEdge = Math.max(newY, 0);

				// Ensure modal does not go past the right edge of the screen
				const rightEdge = Math.min(newX, window.innerWidth - wrapper.offsetWidth);

				// Ensure modal does not go past the bottom edge of the screen
				const bottomEdge = Math.min(newY, window.innerHeight - wrapper.offsetHeight);

				wrapper.style.left = `${Math.min(Math.max(leftEdge, 0), window.innerWidth - wrapper.offsetWidth)}px`;
				wrapper.style.top = `${Math.min(Math.max(topEdge, 0), window.innerHeight - wrapper.offsetHeight)}px`;
			}
		}
	}
	createModal();

	GM_addStyle(`
.switch { position: relative; display: inline-block; width: 2.5rem; height: 1.5rem; }

.switch input { opacity: 0; width: 0; height: 0; }

.slider { border-radius: 34px; position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; -webkit-transition: .4s; transition: .4s; }

.slider:before { border-radius: 50%; position: absolute; content: ""; height: 1.1rem; width: 1.1rem; left: 0.2rem; bottom: 0.2rem; background-color: white; -webkit-transition: .4s; transition: .4s; }

input:checked + .slider { background-color: #2196F3; }

input:focus + .slider { box-shadow: 0 0 1px #2196F3; }

input:checked + .slider:before { -webkit-transform: translateX(1rem); -ms-transform: translateX(1rem); transform: translateX(1rem); }
`);
})();
