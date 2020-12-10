/// <reference path="NativeContainerInterface.ts" />
/// <reference path="TileEntityInterface.ts" />

namespace StorageInterface {
	type ContainersMap = {[key: number]: Container};
	type StoragesMap = {[key: number]: Storage};

	export var data: {[key: number]: StorageDescriptor} = {};

	export var directionsBySide = [
		{x: 0, y: -1, z: 0}, // down
		{x: 0, y: 1, z: 0}, // up
		{x: 0, y: 0, z: -1}, // north
		{x: 0, y: 0, z: 1}, // south
		{x: -1, y: 0, z: 0}, // east
		{x: 1, y: 0, z: 0} // west
	];

	export function getRelativeCoords(coords: Vector, side: number): Vector {
		let dir = directionsBySide[side];
		return {x: coords.x + dir.x, y: coords.y + dir.y, z: coords.z + dir.z};
	}

	export function setSlotMaxStackPolicy(container: ItemContainer, slotName: string, maxCount: number): void {
		container.setSlotAddTransferPolicy(slotName, function(container, name, id, amount, data) {
			return Math.max(0, Math.min(amount, maxCount - container.getSlot(name).count));
		});
	}

	export function setSlotValidatePolicy(container: ItemContainer, slotName: string, func: (name: string, id: number, amount: number, data: number, extra: ItemExtraData, container: ItemContainer, playerUid: number) => boolean): void {
		container.setSlotAddTransferPolicy(slotName, function(container, name, id, amount, data, extra, playerUid) {
			return func(name, id, amount, data, extra, container, playerUid) ? amount : 0;
		});
	}

	export function setGlobalValidatePolicy(container: ItemContainer, func: (name: string, id: number, amount: number, data: number, extra: ItemExtraData, container: ItemContainer, playerUid: number) => boolean): void {
		container.setGlobalAddTransferPolicy(function(container, name, id, amount, data, extra, playerUid) {
			return func(name, id, amount, data, extra, container, playerUid) ? amount : 0;
		});
	}

	export function newStorage(storage: TileEntity | Container): Storage {
		if ("container" in storage) {
			return new TileEntityInterface(storage);
		}
		if ("getParent" in storage) {
			return new TileEntityInterface(storage.getParent());
		}
		return new NativeContainerInterface(storage as any);
	}

	export function createInterface(id: number, descriptor: StorageDescriptor): void {
		let tilePrototype = TileEntity.getPrototype(id);
		if (tilePrototype) {
			if (descriptor.slots) {
				for (let name in descriptor.slots) {
					if (name.includes('^')) {
						let slotData = descriptor.slots[name];
						let str = name.split('^');
						let index = str[1].split('-');
						for (let i = parseInt(index[0]); i <= parseInt(index[1]); i++) {
							descriptor.slots[str[0] + i] = slotData;
						}
						delete descriptor.slots[name];
					}
				}
			}
			else {
				descriptor.slots = {};
			}

			data[id] = descriptor;
		} else {
			Logger.Log("Failed to create storage interface: cannot find tile entity prototype for id "+id, "ERROR");
		}
	}

	/** Trasfers item to slot
	 * @count amount to transfer. Default is 64.
	 * @returns transfered amount
	 */
	export function addItemToSlot(item: ItemInstance, slot: ItemInstance, count: number = 64): number {
		if (slot.id == 0 || slot.id == item.id && slot.data == item.data) {
			let maxStack = Item.getMaxStack(item.id);
			let add = Math.min(maxStack - slot.count, item.count);
			if (count < add) add = count;
			if (add > 0) {
				slot.id = item.id;
				slot.count += add;
				slot.data = item.data;
				if (item.extra) slot.extra = item.extra;
				item.count -= add;
				if (item.count == 0) {
					item.id = item.data = 0;
				}
				return add;
			}
		}
		return 0;
	}

	/** @returns Storage for container in the world */
	export function getStorage(region: BlockSource, x: number, y: number, z: number): Nullable<Storage> {
		let nativeTileEntity = region.getBlockEntity(x, y, z);
		if (nativeTileEntity && nativeTileEntity.getSize() > 0) {
			return new NativeContainerInterface(nativeTileEntity);
		}
		let tileEntity = World.getTileEntity(x, y, z, region);
		if (tileEntity && tileEntity.container) {
			return new TileEntityInterface(tileEntity);
		}
		return null;
	}

	/** @returns Storage for TileEntity in the world if it has liquid storage */
	export function getLiquidStorage(region: BlockSource, x: number, y: number, z: number): Nullable<TileEntityInterface> {
		let tileEntity = World.getTileEntity(x, y, z, region);
		if (tileEntity && tileEntity.liquidStorage) {
			return new TileEntityInterface(tileEntity);
		}
		return null;
	}

	/** @returns Storage for neighbour container on specified side */
	export function getNeighbourStorage(region: BlockSource, coords: Vector, side: number): Nullable<Storage> {
		let dir = getRelativeCoords(coords, side);
		return getStorage(region, dir.x, dir.y, dir.z);
	}

	/** @returns Storage for neighbour TileEntity on specified side if it has liquid storage */
	export function getNeighbourLiquidStorage(region: BlockSource, coords: Vector, side: number): Nullable<TileEntityInterface> {
		let dir = getRelativeCoords(coords, side);
		return getLiquidStorage(region, dir.x, dir.y, dir.z);
	}

	/**
	 * @returns object containing neigbour containers where keys are block side numbers
	 * @side side to get container, use -1 to get from all sides
	*/
	export function getNearestContainers(coords: Vector, side: number, region: BlockSource): ContainersMap {
		let containers = {};
		for (let i = 0; i < 6; i++) {
			if (side >= 0 && i != side) continue;
			let dir = getRelativeCoords(coords, i);
			let container = World.getContainer(dir.x, dir.y, dir.z, region);
			if (container) {
				containers[i] = container;
			}
		}
		return containers;
	}

	/**
	 * @returns object containing neigbour liquid storages where keys are block side numbers
	 * @side side to get storage, use -1 to get from all sides
	*/
	export function getNearestLiquidStorages(coords: Vector, side: number, region: BlockSource): StoragesMap {
		let storages = {};
		for (let i = 0; i < 6; i++) {
			if (side >= 0 && side != i) continue;
			let storage = getNeighbourLiquidStorage(region, coords, i);
			if (storage) storages[i] = storage;
		}
		return storages;
	}

	/**
	 * @returns array of slot indexes for vanilla container or array of slot names for mod container
	*/
	export function getContainerSlots(container: Container): string[] | number[] {
		let slots = [];
		if ("slots" in container) {
			for (let name in container.slots) {
				slots.push(name);
			}
		}
		else {
			let size = container.getSize();
			for (let i = 0; i < size; i++) {
				slots.push(i);
			}
		}
		return slots;
	}

	/** Puts items to containers */
	export function putItems(items: ItemInstance[], containers: ContainersMap): void {
		for (let i in items) {
			let item = items[i];
			for (let side in containers) {
				if (item.count == 0) break;
				let container = containers[side];
				putItemToContainer(item, container, parseInt(side) ^ 1);
			}
		}
	}

	/**
	 * @side block side of container which receives item
	 * @maxCount max count of item to transfer (optional)
	*/
	export function putItemToContainer(item: ItemInstance, container: TileEntity | Container, side?: number, maxCount?: number): number {
		let storage = newStorage(container);
		return storage.addItem(item, side, maxCount);
	}

	/**
	 * Extracts items from one container to another
	 * @inputContainer container to receive items
	 * @outputContainer container to extract items
	 * @inputSide block side of input container which is receiving items
	 * @maxCount max total count of extracted items (optional)
	 * @oneStack if true, will extract only 1 item
	*/
	export function extractItemsFromContainer(inputContainer: TileEntity | Container, outputContainer: TileEntity | Container, inputSide: number, maxCount?: number, oneStack?: boolean): number {
		let inputStorage = newStorage(inputContainer);
		let outputStorage = newStorage(outputContainer);
		return extractItemsFromStorage(inputStorage, outputStorage, inputSide, maxCount, oneStack);
	}

	/**
	 * Extracts items from one container to another
	 * @inputStorage container interface to receive items
	 * @outputStorage container interface to extract items
	 * @inputSide block side of input container which is receiving items
	 * @maxCount max total count of extracted items (optional)
	 * @oneStack if true, will extract only 1 item
	*/
	export function extractItemsFromStorage(inputStorage: Storage, outputStorage: Storage, inputSide: number, maxCount?: number, oneStack?: boolean): number {
		let count = 0;
		let slots = outputStorage.getOutputSlots(inputSide ^ 1);
		for (let name of slots) {
			let slot = outputStorage.getSlot(name);
			if (slot.id > 0) {
				let added = inputStorage.addItem(slot, inputSide, maxCount - count);
				if (added > 0) {
					count += added;
					outputStorage.setSlot(name, slot.id, slot.count, slot.data, slot.extra);
					if (oneStack || count >= maxCount) {break;}
				}
			}
		}
		return count;
	}

	/**
	 * Extract liquid from one storage to another
	 * @liquid liquid to extract. If null, will extract liquid stored in output storage
	 * @maxAmount max amount of liquid that can be transfered
	 * @inputStorage storage to input liquid
	 * @outputStorage storage to extract liquid
	 * @inputSide block side of input storage which is receiving liquid
	*/
	export function extractLiquid(liquid: Nullable<string>, maxAmount: number, inputStorage: TileEntity | Storage, outputStorage: Storage, inputSide: number): number {
		let outputSide = inputSide ^ 1;
		if (!(inputStorage instanceof TileEntityInterface)) { // reverse compatibility
			inputStorage = new TileEntityInterface(inputStorage as TileEntity);
		}
		if (!liquid) {
			liquid = outputStorage.getLiquidStored("output");
		}

		if (liquid && outputStorage.canTransportLiquid(liquid, outputSide)) {
			return transportLiquid(liquid, maxAmount, outputStorage, inputStorage, outputSide);
		}
		return 0;
	}

	/** Similar to StorageInterface.extractLiquid, but liquid must be specified */
	export function transportLiquid(liquid: string, maxAmount: number, outputStorage: TileEntity | Storage, inputStorage: Storage, outputSide: number): number {
		if (!(outputStorage instanceof TileEntityInterface)) { // reverse compatibility
			outputStorage = new TileEntityInterface(outputStorage as TileEntity);
		}

		if (inputStorage.canReceiveLiquid(liquid, outputSide ^ 1)) {
			let amount = outputStorage.getLiquid(liquid, maxAmount);
			amount = inputStorage.addLiquid(liquid, amount);
			outputStorage.getLiquid(liquid, -amount);
			return amount;
		}
		return 0;
	}

	/**
	 * Every 8 ticks checks neigbour hoppers and transfers items.
	 * Use it in tick function of TileEntity
	*/
	export function checkHoppers(tile: TileEntity): void {
		if (World.getThreadTime()%8 > 0) return;
		let region = tile.blockSource;
		let storage = StorageInterface.newStorage(tile);

		// input
		for (let side = 1; side < 6; side++) {
			let dir = getRelativeCoords(tile, side);
			let block = region.getBlock(dir.x, dir.y, dir.z);
			if (block.id == 154 && block.data == side + Math.pow(-1, side)) {
				let hopper = StorageInterface.getStorage(region, dir.x, dir.y, dir.z);
				extractItemsFromStorage(storage, hopper, side, 1);
			}
		}

		// extract
		if (region.getBlockId(tile.x, tile.y - 1, tile.z) == 154) {
			let hopper = StorageInterface.getStorage(region, tile.x, tile.y - 1, tile.z);
			extractItemsFromStorage(hopper, storage, 0, 1);
		}
	}
}


Callback.addCallback("TileEntityAdded", function(tileEntity: TileEntity, created: boolean) {
	if (created) { // fix of TileEntity access from ItemContainer
		tileEntity.container.setParent(tileEntity);
	}
	if (StorageInterface.data[tileEntity.blockID]) { // reverse compatibility
		tileEntity.interface = new TileEntityInterface(tileEntity);
	}
});

EXPORT("StorageInterface", StorageInterface);