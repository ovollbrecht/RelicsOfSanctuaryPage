/* d2s save parser - D2RMM fork of dschu012/d2s, MIT. Built by scripts/vendor-d2s/build.mjs; do not edit. */
var process = globalThis.process ?? { env: {} };
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// scripts/vendor-d2s/shims/shared/i18n.ts
function te(key, params, error) {
  const e = new Error(`${key} ${params ? JSON.stringify(params) : ""}${error ? " <- " + (error.message ?? error) : ""}`);
  return e;
}

// scripts/vendor-d2s/src/binary/bitreader.ts
var BitReader = class {
  constructor(arrBuffer) {
    __publicField(this, "littleEndian", true);
    __publicField(this, "bits");
    __publicField(this, "offset", 0);
    const typedArray = new Uint8Array(arrBuffer);
    this.bits = new Uint8Array(typedArray.length * 8);
    typedArray.reduce((acc, c) => {
      const b = c.toString(2).padStart(8, "0").split("").reverse().map((e) => parseInt(e, 2));
      b.forEach((bit) => this.bits[acc++] = bit);
      return acc;
    }, 0);
  }
  ReadBit() {
    if (this.offset >= this.bits.length) {
      const byteOffset = Math.floor(this.offset / 8);
      throw te("d2s.binary.readBit.overflow", {
        byteOffset,
        bitOffset: this.offset,
        bufferSize: this.bits.length / 8
      });
    }
    return this.bits[this.offset++];
  }
  ReadBitArray(count) {
    if (this.offset + count > this.bits.length) {
      const byteOffset = Math.floor(this.offset / 8);
      const bytesNeeded = Math.ceil(count / 8);
      const bytesAvailable = Math.floor((this.bits.length - this.offset) / 8);
      throw te("d2s.binary.readBitArray.overflow", {
        count,
        bytesNeeded,
        byteOffset,
        bytesAvailable
      });
    }
    const bits = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      bits[i] = this.bits[this.offset++];
    }
    return bits;
  }
  ReadBits(bytes, count) {
    let byteIndex = 0;
    let bitIndex = 0;
    for (let i = 0; i < count; i++) {
      if (this.bits[this.offset + i]) {
        bytes[byteIndex] |= 1 << bitIndex & 255;
      }
      bitIndex++;
      if (bitIndex == 8) {
        byteIndex++;
        bitIndex = 0;
      }
    }
    this.offset += count;
    return bytes;
  }
  ReadBytes(bytes) {
    return this.ReadBits(new Uint8Array(bytes), bytes * 8);
  }
  ReadArray(bytes) {
    return this.ReadBytes(bytes);
  }
  ReadByte(bits = 8) {
    const dataview = new DataView(
      this.ReadBits(new Uint8Array(1), bits).buffer
    );
    return dataview.getUint8(0);
  }
  ReadUInt8(bits = 8) {
    return this.ReadByte(bits);
  }
  ReadUInt16(bits = 8 * 2) {
    const dataview = new DataView(
      this.ReadBits(new Uint8Array(2), bits).buffer
    );
    return dataview.getUint16(0, this.littleEndian);
  }
  ReadUInt32(bits = 8 * 4) {
    const dataview = new DataView(
      this.ReadBits(new Uint8Array(4), bits).buffer
    );
    return dataview.getUint32(0, this.littleEndian);
  }
  ReadString(bytes) {
    try {
      const buffer = this.ReadBytes(bytes).buffer;
      return new TextDecoder().decode(buffer);
    } catch (error) {
      const byteOffset = Math.floor(this.offset / 8);
      throw te("d2s.binary.readString.failed", {
        bytes,
        byteOffset,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  ReadNullTerminatedString() {
    const start = this.offset;
    while (this.ReadByte()) {
    }
    const end = this.offset - 8;
    const buffer = this.SeekBit(start).ReadBytes((end - start) / 8);
    this.SeekBit(end + 8);
    return new TextDecoder().decode(buffer);
  }
  SkipBits(number) {
    this.offset += number;
    return this;
  }
  SkipBytes(number) {
    return this.SkipBits(number * 8);
  }
  SeekBit(offset) {
    this.offset = offset;
    return this;
  }
  SeekByte(offset) {
    return this.SeekBit(offset * 8);
  }
  Align() {
    this.offset = this.offset + 7 & ~7;
    return this;
  }
};

// scripts/vendor-d2s/src/binary/bitwriter.ts
var BitWriter = class {
  constructor(capacity = 8192) {
    __publicField(this, "littleEndian", true);
    __publicField(this, "bits");
    __publicField(this, "offset", 0);
    __publicField(this, "length", 0);
    this.bits = new Uint8Array(capacity);
  }
  WriteBit(value) {
    if (this.offset >= this.bits.length) {
      const resized = new Uint8Array(this.bits.length + 8192);
      resized.set(this.bits, 0);
      this.bits = resized;
    }
    this.bits[this.offset++] = value;
    if (this.offset > this.length) this.length++;
    return this;
  }
  WriteBits(bits, numberOfBits) {
    for (let i = 0; i < numberOfBits; i++) {
      this.WriteBit(bits[i]);
    }
    return this;
  }
  WriteBytes(bytes, numberOfBits) {
    bytes = bytes instanceof Uint8Array ? bytes : Uint8Array.from(
      Object.values(bytes)
    );
    numberOfBits ?? (numberOfBits = bytes.length * 8);
    const toWrite = new Uint8Array(numberOfBits);
    bytes.reduce((acc, c) => {
      const b = c.toString(2).padStart(8, "0").split("").reverse().map((e) => parseInt(e, 2));
      b.forEach((bit) => toWrite[acc++] = bit);
      return acc;
    }, 0);
    return this.WriteBits(toWrite, numberOfBits);
  }
  WriteArray(bytes, numberOfBits) {
    return this.WriteBytes(bytes, numberOfBits);
  }
  WriteByte(value, numberOfBits = 8) {
    const buffer = new Uint8Array(1);
    new DataView(buffer.buffer).setUint8(0, value);
    return this.WriteBytes(buffer, numberOfBits);
  }
  WriteUInt8(value, numberOfBits = 8) {
    return this.WriteByte(value, numberOfBits);
  }
  WriteUInt16(value, numberOfBits = 8 * 2) {
    const buffer = new Uint8Array(2);
    new DataView(buffer.buffer).setUint16(0, value, this.littleEndian);
    return this.WriteBytes(buffer, numberOfBits);
  }
  WriteUInt32(value, numberOfBits = 8 * 4) {
    const buffer = new Uint8Array(4);
    new DataView(buffer.buffer).setUint32(0, value, this.littleEndian);
    return this.WriteBytes(buffer, numberOfBits);
  }
  WriteString(value, numberOfBytes) {
    const buffer = new TextEncoder().encode(value);
    return this.WriteBytes(buffer, numberOfBytes * 8);
  }
  SeekBit(offset) {
    this.offset = offset;
    if (this.offset > this.length) {
      this.length = this.offset;
    }
    return this;
  }
  SeekByte(offset) {
    return this.SeekBit(offset * 8);
  }
  PeekBytes(count) {
    const buffer = new Uint8Array(count);
    let byteIndex = 0;
    let bitIndex = 0;
    for (let i = 0; i < count * 8; ++i) {
      if (this.bits[this.offset + i]) {
        buffer[byteIndex] |= 1 << bitIndex & 255;
      }
      ++bitIndex;
      if (bitIndex >= 8) {
        ++byteIndex;
        bitIndex = 0;
      }
    }
    return buffer;
  }
  Align() {
    this.offset = this.offset + 7 & ~7;
    if (this.offset > this.length) {
      this.length = this.offset;
    }
    return this;
  }
  ToArray() {
    const buffer = new Uint8Array((this.length - 1) / 8 + 1);
    let byteIndex = 0;
    let bitIndex = 0;
    for (let i = 0; i < this.length; ++i) {
      if (this.bits[i]) {
        buffer[byteIndex] |= 1 << bitIndex & 255;
      }
      ++bitIndex;
      if (bitIndex >= 8) {
        ++byteIndex;
        bitIndex = 0;
      }
    }
    return buffer;
  }
};

// scripts/vendor-d2s/src/d2/errors.ts
function formatCharContext(char) {
  const parts = [];
  if (char.header?.name) {
    parts.push(`name: ${char.header.name}`);
  }
  if (char.header?.class) {
    parts.push(`class: ${char.header.class}`);
  }
  if (char.header?.level !== void 0) {
    parts.push(`level: ${char.header.level}`);
  }
  return parts.length > 0 ? `Character(${parts.join(", ")})` : "Character";
}

// scripts/vendor-d2s/src/d2/attributes.ts
async function readAttributes(char, reader2, constants) {
  try {
    char.attributes = {};
    const header = reader2.ReadString(2);
    if (header != "gf") {
      if (char.header.level === 1) {
        const classData = constants.classes[char.header.class_id];
        if (!classData) {
          throw te("d2s.parse.attrs.classNotFound", {
            class: char.header.class_id
          });
        }
        char.attributes = {
          strength: +classData.str,
          energy: +classData.int,
          dexterity: +classData.dex,
          vitality: +classData.vit,
          unused_stats: 0,
          unused_skill_points: 0,
          current_hp: +classData.vit + +classData.hpadd,
          max_hp: +classData.vit + +classData.hpadd,
          current_mana: +classData.int,
          max_mana: +classData.int,
          current_stamina: +classData.stam,
          max_stamina: +classData.stam,
          level: 1,
          experience: 0,
          gold: 0,
          stashed_gold: 0
        };
        return;
      }
      const byteOffset = Math.floor((reader2.offset - 2 * 8) / 8);
      throw te("d2s.parse.attrs.headerNotFound", {
        found: header,
        offset: byteOffset,
        char: formatCharContext(char)
      });
    }
    char.header.attributes_order = [];
    let id = reader2.ReadUInt16(9);
    while (id != 511) {
      char.header.attributes_order.push(id);
      const field = constants.magical_properties[id];
      if (field === void 0) {
        const byteOffset = Math.floor((reader2.offset - 9) / 8);
        throw te("d2s.parse.attrs.invalidStatId", {
          id,
          offset: byteOffset,
          char: formatCharContext(char)
        });
      }
      const size = field.cB;
      try {
        char.attributes[Attributes[field.s]] = reader2.ReadUInt32(size);
        if (id >= 6 && id <= 11) {
          char.attributes[Attributes[field.s]] /= 256;
        }
      } catch (error) {
        throw te(
          "d2s.parse.attrs.readAttrFailed",
          {
            attr: field.s,
            id
          },
          error
        );
      }
      id = reader2.ReadUInt16(9);
    }
    reader2.Align();
  } catch (error) {
    throw te(
      "d2s.parse.attrs.readFailed",
      {
        char: formatCharContext(char)
      },
      error
    );
  }
}
async function writeAttributes(char, constants) {
  try {
    const writer2 = new BitWriter();
    writer2.WriteString("gf", 2);
    const order = [...char.header.attributes_order ?? []];
    const writtenIds = /* @__PURE__ */ new Set();
    for (let i = 0; i < 16; i++) {
      if (!order.includes(i)) {
        order.push(i);
      }
    }
    for (const i of order) {
      const property = constants.magical_properties[i];
      if (property === void 0) {
        throw te("d2s.parse.attrs.unknownWriteStatId", { id: i });
      }
      let value = char.attributes[Attributes[property.s]];
      if (value == null) {
        continue;
      }
      writtenIds.add(i);
      const size = property.cB;
      if (i >= 6 && i <= 11) {
        value = Math.round(value * 256);
      }
      writer2.WriteUInt16(i, 9);
      writer2.WriteUInt32(value, size);
    }
    writer2.WriteUInt16(511, 9);
    writer2.Align();
    return writer2.ToArray();
  } catch (error) {
    throw te(
      "d2s.parse.attrs.writeFailed",
      {
        char: formatCharContext(char)
      },
      error
    );
  }
}
var Attributes = {
  strength: "strength",
  energy: "energy",
  dexterity: "dexterity",
  vitality: "vitality",
  statpts: "unused_stats",
  newskills: "unused_skill_points",
  hitpoints: "current_hp",
  maxhp: "max_hp",
  mana: "current_mana",
  maxmana: "max_mana",
  stamina: "current_stamina",
  maxstamina: "max_stamina",
  level: "level",
  experience: "experience",
  gold: "gold",
  goldbank: "stashed_gold"
};

// scripts/vendor-d2s/src/d2/constants.ts
var versionedConstants = /* @__PURE__ */ new Map();
function getConstantData(version) {
  if (!versionedConstants.has(version)) {
    throw new Error(`No constant data found for this version ${version}`);
  }
  return versionedConstants.get(version);
}
function setConstantData(version, data) {
  versionedConstants.set(version, data);
}

// scripts/vendor-d2s/src/d2/debug.ts
var DEBUG_D2S = process.env.DEBUG_PROD === "true";
function extractRawBytes(reader2, startBitOffset, byteCount) {
  try {
    const bytes = [];
    for (let i = 0; i < byteCount; i++) {
      const bitOffset = startBitOffset + i * 8;
      if (bitOffset + 8 > reader2.bits.length) {
        break;
      }
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        if (reader2.bits[bitOffset + bit]) {
          byte |= 1 << bit;
        }
      }
      bytes.push(byte);
    }
    const lines = [];
    for (let i = 0; i < bytes.length; i += 16) {
      const lineBytes = bytes.slice(i, i + 16);
      const hex = lineBytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
      const offset = Math.floor(startBitOffset / 8) + i;
      lines.push(`  0x${offset.toString(16).padStart(4, "0")}: ${hex}`);
    }
    return "\n" + lines.join("\n");
  } catch (e) {
    return " (unable to extract bytes)";
  }
}

// scripts/vendor-d2s/src/d2/versions/default_header.ts
var default_header_exports = {};
__export(default_header_exports, {
  readHeader: () => readHeader,
  writeHeader: () => writeHeader
});
var difficulties = ["normal", "nm", "hell"];
function readHeader(char, reader2, constants) {
  if (DEBUG_D2S) {
    char.header.hex = extractRawBytes(reader2, reader2.offset, 300);
  }
  char.header.filesize = reader2.ReadUInt32();
  char.header.checksum = reader2.ReadUInt32().toString(16).padStart(8, "0");
  reader2.SkipBytes(4);
  if (char.header.version >= 105) {
  } else if (char.header.version >= 98) {
    reader2.SkipBytes(16);
  } else {
    char.header.name = reader2.ReadString(16).replace(/\0/g, "");
  }
  char.header.status = _readStatus(reader2.ReadUInt8());
  char.header.progression = reader2.ReadUInt8();
  char.header.active_arms = reader2.ReadUInt16();
  char.header.class_id = reader2.ReadUInt8();
  reader2.SkipBytes(2);
  char.header.level = reader2.ReadUInt8();
  char.header.created = reader2.ReadUInt32();
  char.header.last_played = reader2.ReadUInt32();
  reader2.SkipBytes(4);
  char.header.assigned_skill_ids = _readAssignedSkills(reader2.ReadArray(64));
  char.header.left_skill = constants.skills[reader2.ReadUInt32()]?.s;
  char.header.right_skill = constants.skills[reader2.ReadUInt32()]?.s;
  char.header.left_swap_skill = constants.skills[reader2.ReadUInt32()]?.s;
  char.header.right_swap_skill = constants.skills[reader2.ReadUInt32()]?.s;
  char.header.menu_appearance = _readCharMenuAppearance(
    reader2.ReadArray(32),
    constants
  );
  char.header.difficulty = _readDifficulty(reader2.ReadArray(3));
  char.header.map_id = reader2.ReadUInt32();
  reader2.SkipBytes(2);
  char.header.dead_merc = reader2.ReadUInt16();
  char.header.merc_id = reader2.ReadUInt32().toString(16);
  char.header.merc_name_id = reader2.ReadUInt16();
  char.header.merc_type = reader2.ReadUInt16();
  char.header.merc_experience = reader2.ReadUInt32();
  if (char.header.version >= 105) {
    char.header.unknown_before_realm = reader2.ReadBytes(73);
    char.header.realm = reader2.ReadUInt8();
    char.header.unknown_after_realm = reader2.ReadBytes(50);
    char.header.name = reader2.ReadString(16).replace(/\0/g, "");
    char.header.unknown_after_name = reader2.ReadBytes(4);
  } else if (char.header.version >= 98) {
    char.header.unknown_before_realm = reader2.ReadBytes(73);
    char.header.realm = reader2.ReadUInt8();
    char.header.unknown_after_realm = reader2.ReadBytes(2);
    char.header.name = reader2.ReadString(16).replace(/\0/g, "");
    char.header.unknown_after_name = reader2.ReadBytes(52);
  } else {
    char.header.unknown_before_realm = reader2.ReadBytes(73);
    char.header.realm = reader2.ReadUInt8();
    char.header.unknown_after_realm = reader2.ReadBytes(70);
  }
  if (char.header.version >= 105) {
    char.header.extended_header_data = reader2.ReadBytes(84);
  }
  char.header.quests_header_magic = reader2.ReadString(4);
  char.header.quests_header_version = reader2.ReadUInt32();
  char.header.quests_header_length = reader2.ReadUInt16();
  char.header.quests_normal = _readQuests(reader2.ReadArray(96));
  char.header.quests_nm = _readQuests(reader2.ReadArray(96));
  char.header.quests_hell = _readQuests(reader2.ReadArray(96));
  char.header.waypoints_header_magic = reader2.ReadString(2);
  char.header.waypoints_header_version = reader2.ReadUInt32();
  char.header.waypoints_header_length = reader2.ReadUInt16();
  char.header.waypoints = _readWaypointData(reader2.ReadArray(72), constants);
  char.header.npcs_header_magic = reader2.ReadArray(2);
  char.header.npcs_header_length = reader2.ReadUInt16();
  char.header.npcs = _readNPCData(reader2.ReadArray(48));
}
function writeHeader(char, writer2, constants) {
  writer2.WriteUInt32(0);
  writer2.WriteUInt32(0);
  writer2.WriteBytes(new Uint8Array(4));
  if (char.header.version >= 105) {
  } else if (char.header.version >= 98) {
    writer2.WriteBytes(new Uint8Array(16));
  } else {
    writer2.WriteString(char.header.name, 16);
  }
  writer2.WriteArray(_writeStatus(char.header.status));
  writer2.WriteUInt8(char.header.progression);
  writer2.WriteUInt16(char.header.active_arms);
  writer2.WriteUInt8(char.header.class_id);
  writer2.WriteArray(new Uint8Array([16, 30]));
  writer2.WriteUInt8(char.header.level);
  writer2.WriteUInt32(char.header.created);
  writer2.WriteUInt32(char.header.last_played);
  writer2.WriteArray(new Uint8Array([255, 255, 255, 255]));
  writer2.WriteArray(_writeAssignedSkills(char.header.assigned_skill_ids));
  writer2.WriteUInt32(_skillId(char.header.left_skill, constants));
  writer2.WriteUInt32(_skillId(char.header.right_skill, constants));
  writer2.WriteUInt32(_skillId(char.header.left_swap_skill, constants));
  writer2.WriteUInt32(_skillId(char.header.right_swap_skill, constants));
  writer2.WriteArray(
    _writeCharMenuAppearance(char.header.menu_appearance, constants)
  );
  writer2.WriteArray(_writeDifficulty(char.header.difficulty));
  writer2.WriteUInt32(char.header.map_id);
  writer2.WriteArray(new Uint8Array([0, 0]));
  writer2.WriteUInt16(char.header.dead_merc);
  writer2.WriteUInt32(parseInt(char.header.merc_id, 16));
  writer2.WriteUInt16(char.header.merc_name_id);
  writer2.WriteUInt16(char.header.merc_type);
  writer2.WriteUInt32(char.header.merc_experience);
  if (char.header.version >= 105) {
    writer2.WriteArray(char.header.unknown_before_realm ?? new Uint8Array(73));
    writer2.WriteUInt8(char.header.realm);
    writer2.WriteArray(char.header.unknown_after_realm ?? new Uint8Array(50));
    writer2.WriteString(char.header.name, 16);
    writer2.WriteArray(char.header.unknown_after_name ?? new Uint8Array(4));
  } else if (char.header.version >= 98) {
    writer2.WriteArray(char.header.unknown_before_realm ?? new Uint8Array(73));
    writer2.WriteUInt8(char.header.realm);
    writer2.WriteArray(char.header.unknown_after_realm ?? new Uint8Array(2));
    writer2.WriteString(char.header.name, 16);
    writer2.WriteArray(char.header.unknown_after_name ?? new Uint8Array(52));
  } else {
    writer2.WriteArray(char.header.unknown_before_realm ?? new Uint8Array(73));
    writer2.WriteUInt8(char.header.realm);
    writer2.WriteArray(char.header.unknown_after_realm ?? new Uint8Array(70));
  }
  if (char.header.version >= 105) {
    writer2.WriteBytes(char.header.extended_header_data ?? new Uint8Array(84));
  }
  writer2.WriteString(char.header.quests_header_magic ?? "Woo!", 4);
  writer2.WriteUInt32(char.header.quests_header_version ?? 6);
  writer2.WriteUInt16(char.header.quests_header_length ?? 298);
  writer2.WriteArray(_writeQuests(char.header.quests_normal));
  writer2.WriteArray(_writeQuests(char.header.quests_nm));
  writer2.WriteArray(_writeQuests(char.header.quests_hell));
  writer2.WriteString(char.header.waypoints_header_magic ?? "WS", 2);
  writer2.WriteUInt32(char.header.waypoints_header_version ?? 1);
  writer2.WriteUInt16(char.header.waypoints_header_length ?? 80);
  writer2.WriteArray(_writeWaypointData(char.header.waypoints, constants));
  writer2.WriteBytes(
    char.header.npcs_header_magic ?? new Uint8Array([1, 119])
  );
  writer2.WriteUInt16(char.header.npcs_header_length ?? 52);
  writer2.WriteArray(_writeNPCData(char.header.npcs));
}
function _skillId(name, constants) {
  if (name === "") return 0;
  if (!name) return -1;
  const idx = constants.skills.findIndex((s) => s && s.s == name);
  return idx >= 0 ? idx : 0;
}
function _readStatus(byte) {
  const status = {};
  status.b1 = (byte >>> 0 & 1) === 1;
  status.b2 = (byte >>> 1 & 1) === 1;
  status.hardcore = (byte >>> 2 & 1) === 1;
  status.died = (byte >>> 3 & 1) === 1;
  status.b5 = (byte >>> 4 & 1) === 1;
  status.expansion = (byte >>> 5 & 1) === 1;
  status.ladder = (byte >>> 6 & 1) === 1;
  status.b8 = (byte >>> 7 & 1) === 1;
  return status;
}
function _writeStatus(status) {
  const arr = new Uint8Array(1);
  arr[0] |= status.b1 ? 1 << 0 : 0;
  arr[0] |= status.b2 ? 1 << 1 : 0;
  arr[0] |= status.hardcore ? 1 << 2 : 0;
  arr[0] |= status.died ? 1 << 3 : 0;
  arr[0] |= status.b5 ? 1 << 4 : 0;
  arr[0] |= status.expansion ? 1 << 5 : 0;
  arr[0] |= status.ladder ? 1 << 6 : 0;
  arr[0] |= status.b8 ? 1 << 7 : 0;
  return arr;
}
function _readCharMenuAppearance(bytes, _constants) {
  const appearance = {};
  const reader2 = new BitReader(bytes);
  const graphics = reader2.ReadArray(16);
  const tints = reader2.ReadArray(16);
  appearance.head = {
    graphic: graphics[0],
    tint: tints[0]
  };
  appearance.torso = {
    graphic: graphics[1],
    tint: tints[1]
  };
  appearance.legs = {
    graphic: graphics[2],
    tint: tints[2]
  };
  appearance.right_arm = {
    graphic: graphics[3],
    tint: tints[3]
  };
  appearance.left_arm = {
    graphic: graphics[4],
    tint: tints[4]
  };
  appearance.right_hand = {
    graphic: graphics[5],
    tint: tints[5]
  };
  appearance.left_hand = {
    graphic: graphics[6],
    tint: tints[6]
  };
  appearance.shield = {
    graphic: graphics[7],
    tint: tints[7]
  };
  appearance.special1 = {
    graphic: graphics[8],
    tint: tints[8]
  };
  appearance.special2 = {
    graphic: graphics[9],
    tint: tints[9]
  };
  appearance.special3 = {
    graphic: graphics[10],
    tint: tints[10]
  };
  appearance.special4 = {
    graphic: graphics[11],
    tint: tints[11]
  };
  appearance.special5 = {
    graphic: graphics[12],
    tint: tints[12]
  };
  appearance.special6 = {
    graphic: graphics[13],
    tint: tints[13]
  };
  appearance.special7 = {
    graphic: graphics[14],
    tint: tints[14]
  };
  appearance.special8 = {
    graphic: graphics[15],
    tint: tints[15]
  };
  return appearance;
}
function _writeCharMenuAppearance(appearance, _constants) {
  const writer2 = new BitWriter(32);
  writer2.length = 32 * 8;
  const graphics = [];
  graphics.push(appearance && appearance.head ? appearance.head.graphic : 0);
  graphics.push(appearance && appearance.torso ? appearance.torso.graphic : 0);
  graphics.push(appearance && appearance.legs ? appearance.legs.graphic : 0);
  graphics.push(
    appearance && appearance.right_arm ? appearance.right_arm.graphic : 0
  );
  graphics.push(
    appearance && appearance.left_arm ? appearance.left_arm.graphic : 0
  );
  graphics.push(
    appearance && appearance.right_hand ? appearance.right_hand.graphic : 0
  );
  graphics.push(
    appearance && appearance.left_hand ? appearance.left_hand.graphic : 0
  );
  graphics.push(
    appearance && appearance.shield ? appearance.shield.graphic : 0
  );
  graphics.push(
    appearance && appearance.special1 ? appearance.special1.graphic : 0
  );
  graphics.push(
    appearance && appearance.special2 ? appearance.special2.graphic : 0
  );
  graphics.push(
    appearance && appearance.special3 ? appearance.special3.graphic : 0
  );
  graphics.push(
    appearance && appearance.special4 ? appearance.special4.graphic : 0
  );
  graphics.push(
    appearance && appearance.special5 ? appearance.special5.graphic : 0
  );
  graphics.push(
    appearance && appearance.special6 ? appearance.special6.graphic : 0
  );
  graphics.push(
    appearance && appearance.special7 ? appearance.special7.graphic : 0
  );
  graphics.push(
    appearance && appearance.special8 ? appearance.special8.graphic : 0
  );
  for (const g of graphics) {
    writer2.WriteUInt8(g);
  }
  const tints = [];
  tints.push(appearance && appearance.head ? appearance.head.tint : 0);
  tints.push(appearance && appearance.torso ? appearance.torso.tint : 0);
  tints.push(appearance && appearance.legs ? appearance.legs.tint : 0);
  tints.push(
    appearance && appearance.right_arm ? appearance.right_arm.tint : 0
  );
  tints.push(appearance && appearance.left_arm ? appearance.left_arm.tint : 0);
  tints.push(
    appearance && appearance.right_hand ? appearance.right_hand.tint : 0
  );
  tints.push(
    appearance && appearance.left_hand ? appearance.left_hand.tint : 0
  );
  tints.push(appearance && appearance.shield ? appearance.shield.tint : 0);
  tints.push(appearance && appearance.special1 ? appearance.special1.tint : 0);
  tints.push(appearance && appearance.special2 ? appearance.special2.tint : 0);
  tints.push(appearance && appearance.special3 ? appearance.special3.tint : 0);
  tints.push(appearance && appearance.special4 ? appearance.special4.tint : 0);
  tints.push(appearance && appearance.special5 ? appearance.special5.tint : 0);
  tints.push(appearance && appearance.special6 ? appearance.special6.tint : 0);
  tints.push(appearance && appearance.special7 ? appearance.special7.tint : 0);
  tints.push(appearance && appearance.special8 ? appearance.special8.tint : 0);
  for (const t of tints) {
    writer2.WriteUInt8(t);
  }
  return writer2.ToArray();
}
function _readAssignedSkills(bytes) {
  const ids = [];
  const reader2 = new BitReader(bytes);
  for (let i = 0; i < 16; i++) {
    const skillId = reader2.ReadUInt32();
    ids.push(skillId);
  }
  return ids;
}
function _writeAssignedSkills(skillIds) {
  const writer2 = new BitWriter(64);
  writer2.length = 64 * 8;
  for (let i = 0; i < 16; i++) {
    writer2.WriteUInt32(skillIds[i]);
  }
  return writer2.ToArray();
}
function _readDifficulty(bytes) {
  const difficulty = {};
  difficulty.Normal = bytes[0];
  difficulty.Nightmare = bytes[1];
  difficulty.Hell = bytes[2];
  return difficulty;
}
function _writeDifficulty(difficulty) {
  const writer2 = new BitWriter(3);
  writer2.length = 3 * 8;
  writer2.WriteUInt8(difficulty.Normal);
  writer2.WriteUInt8(difficulty.Nightmare);
  writer2.WriteUInt8(difficulty.Hell);
  return writer2.ToArray();
}
function _readQuests(bytes) {
  const reader2 = new BitReader(bytes);
  const quests = {};
  quests.act_i = {};
  quests.act_i.introduced = reader2.ReadUInt16();
  quests.act_i.den_of_evil = _readQuest(reader2.ReadArray(2));
  quests.act_i.sisters_burial_grounds = _readQuest(reader2.ReadArray(2));
  quests.act_i.tools_of_the_trade = _readQuest(reader2.ReadArray(2));
  quests.act_i.the_search_for_cain = _readQuest(reader2.ReadArray(2));
  quests.act_i.the_forgotten_tower = _readQuest(reader2.ReadArray(2));
  quests.act_i.sisters_to_the_slaughter = _readQuest(reader2.ReadArray(2));
  quests.act_i.completed = reader2.ReadUInt16();
  quests.act_ii = {};
  quests.act_ii.introduced = reader2.ReadUInt16();
  quests.act_ii.radaments_lair = _readQuest(reader2.ReadArray(2));
  quests.act_ii.the_horadric_staff = _readQuest(reader2.ReadArray(2));
  quests.act_ii.tainted_sun = _readQuest(reader2.ReadArray(2));
  quests.act_ii.arcane_sanctuary = _readQuest(reader2.ReadArray(2));
  quests.act_ii.the_summoner = _readQuest(reader2.ReadArray(2));
  quests.act_ii.the_seven_tombs = _readQuest(reader2.ReadArray(2));
  quests.act_ii.completed = reader2.ReadUInt16();
  quests.act_iii = {};
  quests.act_iii.introduced = reader2.ReadUInt16();
  quests.act_iii.lam_esens_tome = _readQuest(reader2.ReadArray(2));
  quests.act_iii.khalims_will = _readQuest(reader2.ReadArray(2));
  quests.act_iii.blade_of_the_old_religion = _readQuest(reader2.ReadArray(2));
  quests.act_iii.the_golden_bird = _readQuest(reader2.ReadArray(2));
  quests.act_iii.the_blackened_temple = _readQuest(reader2.ReadArray(2));
  quests.act_iii.the_guardian = _readQuest(reader2.ReadArray(2));
  quests.act_iii.completed = reader2.ReadUInt16();
  quests.act_iv = {};
  quests.act_iv.introduced = reader2.ReadUInt16();
  quests.act_iv.the_fallen_angel = _readQuest(reader2.ReadArray(2));
  quests.act_iv.terrors_end = _readQuest(reader2.ReadArray(2));
  quests.act_iv.hellforge = _readQuest(reader2.ReadArray(2));
  quests.act_iv.completed = reader2.ReadUInt16();
  quests.unknown_act_iv_v_gap = reader2.ReadBytes(10);
  quests.act_v = {};
  quests.act_v.introduced = reader2.ReadUInt16();
  quests.act_v.siege_on_harrogath = _readQuest(reader2.ReadArray(2));
  quests.act_v.rescue_on_mount_arreat = _readQuest(reader2.ReadArray(2));
  quests.act_v.prison_of_ice = _readQuest(reader2.ReadArray(2));
  quests.act_v.betrayal_of_harrogath = _readQuest(reader2.ReadArray(2));
  quests.act_v.rite_of_passage = _readQuest(reader2.ReadArray(2));
  quests.act_v.eve_of_destruction = _readQuest(reader2.ReadArray(2));
  quests.act_v.completed = reader2.ReadUInt16();
  quests.unknown_trailing = reader2.ReadBytes(12);
  return quests;
}
function _writeQuests(quests) {
  const writer2 = new BitWriter(96);
  writer2.length = 96 * 8;
  writer2.WriteUInt16(quests.act_i.introduced ?? 0);
  writer2.WriteArray(_writeQuest(quests.act_i.den_of_evil));
  writer2.WriteArray(_writeQuest(quests.act_i.sisters_burial_grounds));
  writer2.WriteArray(_writeQuest(quests.act_i.tools_of_the_trade));
  writer2.WriteArray(_writeQuest(quests.act_i.the_search_for_cain));
  writer2.WriteArray(_writeQuest(quests.act_i.the_forgotten_tower));
  writer2.WriteArray(_writeQuest(quests.act_i.sisters_to_the_slaughter));
  writer2.WriteUInt16(quests.act_i.completed);
  writer2.WriteUInt16(quests.act_ii.introduced);
  writer2.WriteArray(_writeQuest(quests.act_ii.radaments_lair));
  writer2.WriteArray(_writeQuest(quests.act_ii.the_horadric_staff));
  writer2.WriteArray(_writeQuest(quests.act_ii.tainted_sun));
  writer2.WriteArray(_writeQuest(quests.act_ii.arcane_sanctuary));
  writer2.WriteArray(_writeQuest(quests.act_ii.the_summoner));
  writer2.WriteArray(_writeQuest(quests.act_ii.the_seven_tombs));
  writer2.WriteUInt16(quests.act_ii.completed);
  writer2.WriteUInt16(quests.act_iii.introduced);
  writer2.WriteArray(_writeQuest(quests.act_iii.lam_esens_tome));
  writer2.WriteArray(_writeQuest(quests.act_iii.khalims_will));
  writer2.WriteArray(_writeQuest(quests.act_iii.blade_of_the_old_religion));
  writer2.WriteArray(_writeQuest(quests.act_iii.the_golden_bird));
  writer2.WriteArray(_writeQuest(quests.act_iii.the_blackened_temple));
  writer2.WriteArray(_writeQuest(quests.act_iii.the_guardian));
  writer2.WriteUInt16(quests.act_iii.completed);
  writer2.WriteUInt16(quests.act_iv.introduced);
  writer2.WriteArray(_writeQuest(quests.act_iv.the_fallen_angel));
  writer2.WriteArray(_writeQuest(quests.act_iv.terrors_end));
  writer2.WriteArray(_writeQuest(quests.act_iv.hellforge));
  writer2.WriteUInt16(quests.act_iv.completed);
  writer2.WriteBytes(quests.unknown_act_iv_v_gap ?? new Uint8Array(10));
  writer2.WriteUInt16(quests.act_v.introduced);
  writer2.WriteArray(_writeQuest(quests.act_v.siege_on_harrogath));
  writer2.WriteArray(_writeQuest(quests.act_v.rescue_on_mount_arreat));
  writer2.WriteArray(_writeQuest(quests.act_v.prison_of_ice));
  writer2.WriteArray(_writeQuest(quests.act_v.betrayal_of_harrogath));
  writer2.WriteArray(_writeQuest(quests.act_v.rite_of_passage));
  writer2.WriteArray(_writeQuest(quests.act_v.eve_of_destruction));
  writer2.WriteUInt16(quests.act_v.completed);
  writer2.WriteBytes(quests.unknown_trailing ?? new Uint8Array(12));
  return writer2.ToArray();
}
function _readQuest(bytes) {
  const quest = {};
  const reader2 = new BitReader(bytes);
  quest.is_completed = reader2.ReadBit() === 1;
  quest.is_requirement_completed = reader2.ReadBit() === 1;
  quest.is_received = reader2.ReadBit() === 1;
  quest.unk3 = reader2.ReadBit() === 1;
  quest.unk4 = reader2.ReadBit() === 1;
  quest.unk5 = reader2.ReadBit() === 1;
  quest.unk6 = reader2.ReadBit() === 1;
  quest.consumed_scroll = reader2.ReadBit() === 1;
  quest.unk8 = reader2.ReadBit() === 1;
  quest.unk9 = reader2.ReadBit() === 1;
  quest.unk10 = reader2.ReadBit() === 1;
  quest.unk11 = reader2.ReadBit() === 1;
  quest.closed = reader2.ReadBit() === 1;
  quest.done_recently = reader2.ReadBit() === 1;
  quest.unk14 = reader2.ReadBit() === 1;
  quest.unk15 = reader2.ReadBit() === 1;
  return quest;
}
function _writeQuest(quest) {
  const writer2 = new BitWriter(2);
  writer2.length = 2 * 8;
  writer2.WriteBit(+quest.is_completed);
  writer2.WriteBit(+quest.is_requirement_completed);
  writer2.WriteBit(+quest.is_received);
  writer2.WriteBit(+quest.unk3);
  writer2.WriteBit(+quest.unk4);
  writer2.WriteBit(+quest.unk5);
  writer2.WriteBit(+quest.unk6);
  writer2.WriteBit(+quest.consumed_scroll);
  writer2.WriteBit(+quest.unk8);
  writer2.WriteBit(+quest.unk9);
  writer2.WriteBit(+quest.unk10);
  writer2.WriteBit(+quest.unk11);
  writer2.WriteBit(+quest.closed);
  writer2.WriteBit(+quest.done_recently);
  writer2.WriteBit(+quest.unk14);
  writer2.WriteBit(+quest.unk15);
  return writer2.ToArray();
}
function _readWaypointData(bytes, constants) {
  const waypoints = {};
  const reader2 = new BitReader(bytes);
  for (let i = 0; i < difficulties.length; i++) {
    waypoints[difficulties[i]] = _readWaypoints(
      reader2.ReadArray(24),
      constants
    );
  }
  return waypoints;
}
function _readActWaypoints(reader2, levels) {
  const act = {};
  for (const level of levels) {
    act[level] = reader2.ReadBit() === 1;
  }
  return act;
}
function _readWaypoints(bytes, constants) {
  const reader2 = new BitReader(bytes);
  const waypoints = { acts: [] };
  waypoints.unknown_header = reader2.ReadBytes(2);
  for (const levelNames of constants.waypoint_acts) {
    waypoints.acts.push(_readActWaypoints(reader2, levelNames));
  }
  reader2.Align();
  waypoints.unknown_trailing = reader2.ReadBytes(17);
  return waypoints;
}
function _writeWaypointData(waypoints, constants) {
  const writer2 = new BitWriter(72);
  writer2.length = 72 * 8;
  for (let i = 0; i < difficulties.length; i++) {
    const difficultyWaypoints = waypoints[difficulties[i]];
    writer2.WriteArray(_writeWaypoints(difficultyWaypoints, constants));
  }
  return writer2.ToArray();
}
function _writeActWaypoints(writer2, act, levels) {
  for (const level of levels) {
    writer2.WriteBit(act[level] ? 1 : 0);
  }
}
function _writeWaypoints(waypoints, constants) {
  const writer2 = new BitWriter(24);
  writer2.length = 24 * 8;
  writer2.WriteBytes(waypoints.unknown_header ?? new Uint8Array([2, 1]));
  for (let i = 0; i < constants.waypoint_acts.length; i++) {
    _writeActWaypoints(
      writer2,
      waypoints.acts[i] ?? {},
      constants.waypoint_acts[i]
    );
  }
  writer2.Align();
  writer2.WriteBytes(waypoints.unknown_trailing ?? new Uint8Array(17));
  return writer2.ToArray();
}
var NPC_SLOTS = [
  "warriv_act_ii",
  // bit 0
  "unknown_1",
  // bit 1
  "charsi",
  // bit 2
  "warriv_act_i",
  // bit 3
  "kashya",
  // bit 4
  "akara",
  // bit 5
  "gheed",
  // bit 6
  "unknown_2",
  // bit 7
  "greiz",
  // bit 8
  "jerhyn",
  // bit 9
  "meshif_act_ii",
  // bit 10
  "geglash",
  // bit 11
  "lysnader",
  // bit 12
  "fara",
  // bit 13
  "drogan",
  // bit 14
  "unknown_3",
  // bit 15
  "alkor",
  // bit 16
  "hratli",
  // bit 17
  "ashera",
  // bit 18
  "unknown_4",
  // bit 19
  "unknown_5",
  // bit 20
  "cain_act_iii",
  // bit 21
  "unknown_6",
  // bit 22
  "elzix",
  // bit 23
  "malah",
  // bit 24
  "anya",
  // bit 25
  "unknown_7",
  // bit 26
  "natalya",
  // bit 27
  "meshif_act_iii",
  // bit 28
  "unknown_8",
  // bit 29
  "unknown_9",
  // bit 30
  "ormus",
  // bit 31
  "unknown_10",
  // bit 32
  "unknown_11",
  // bit 33
  "unknown_12",
  // bit 34
  "unknown_13",
  // bit 35
  "unknown_14",
  // bit 36
  "cain_act_v",
  // bit 37
  "qualkehk",
  // bit 38
  "nihlathak"
  // bit 39
];
function _readNPCData(bytes) {
  const reader2 = new BitReader(bytes);
  const npcs = {
    normal: {},
    nm: {},
    hell: {}
  };
  for (let i = 0; i < 3; i++) {
    const npc = npcs[difficulties[i]];
    for (const slot of NPC_SLOTS) {
      npc[slot] = { intro: reader2.ReadBit() === 1, congrats: false };
    }
  }
  npcs.unknown_gap = reader2.ReadBytes(9);
  for (let i = 0; i < 3; i++) {
    const npc = npcs[difficulties[i]];
    for (const slot of NPC_SLOTS) {
      npc[slot].congrats = reader2.ReadBit() === 1;
    }
  }
  npcs.unknown_trailing = reader2.ReadBytes(9);
  return npcs;
}
function _writeNPCData(npcs) {
  const writer2 = new BitWriter(48);
  writer2.length = 48 * 8;
  for (let i = 0; i < 3; i++) {
    const npc = npcs[difficulties[i]];
    for (const slot of NPC_SLOTS) {
      writer2.WriteBit(npc?.[slot]?.intro ? 1 : 0);
    }
  }
  writer2.WriteBytes(npcs.unknown_gap ?? new Uint8Array(9));
  for (let i = 0; i < 3; i++) {
    const npc = npcs[difficulties[i]];
    for (const slot of NPC_SLOTS) {
      writer2.WriteBit(npc?.[slot]?.congrats ? 1 : 0);
    }
  }
  writer2.WriteBytes(npcs.unknown_trailing ?? new Uint8Array(9));
  return writer2.ToArray();
}

// scripts/vendor-d2s/src/d2/header.ts
async function readHeader2(char, reader2) {
  try {
    char.header = {};
    char.header.identifier = reader2.ReadUInt32().toString(16).padStart(8, "0");
    if (char.header.identifier != "aa55aa55") {
      throw te("d2s.parse.header.invalidIdentifier", {
        id: char.header.identifier
      });
    }
    char.header.version = reader2.ReadUInt32();
  } catch (error) {
    throw te("d2s.parse.header.readFailed", null, error);
  }
}
async function readHeaderData(char, reader2, constants) {
  try {
    const v = default_header_exports;
    if (v == null) {
      throw te("d2s.parse.header.unsupportedVersion.read", {
        version: char.header.version,
        hex: char.header.version.toString(16)
      });
    }
    v.readHeader(char, reader2, constants);
  } catch (error) {
    throw te(
      "d2s.parse.header.readDataFailed",
      {
        version: char.header.version
      },
      error
    );
  }
}
async function writeHeader2(char) {
  const writer2 = new BitWriter();
  writer2.WriteUInt32(parseInt(char.header.identifier, 16)).WriteUInt32(char.header.version);
  return writer2.ToArray();
}
async function writeHeaderData(char, constants) {
  try {
    const writer2 = new BitWriter();
    const v = default_header_exports;
    if (v == null) {
      throw te("d2s.parse.header.unsupportedVersion.write", {
        version: char.header.version,
        hex: char.header.version.toString(16)
      });
    }
    v.writeHeader(char, writer2, constants);
    return writer2.ToArray();
  } catch (error) {
    throw te(
      "d2s.parse.header.writeDataFailed",
      {
        version: char.header.version
      },
      error
    );
  }
}
async function fixHeader(writer2) {
  let checksum = 0;
  const eof = writer2.length / 8;
  writer2.SeekByte(8).WriteUInt32(eof);
  writer2.SeekByte(12).WriteUInt32(0);
  for (let i = 0; i < eof; i++) {
    let byte = writer2.SeekByte(i).PeekBytes(1)[0];
    if (checksum & 2147483648) {
      byte += 1;
    }
    checksum = byte + checksum * 2;
    checksum >>>= 0;
  }
  writer2.SeekByte(12).WriteUInt32(checksum);
}

// scripts/vendor-d2s/src/d2/items.ts
var HUFFMAN = [[[[["w", "u"], [["8", ["y", ["5", ["j", []]]]], "h"]], ["s", [["2", "n"], "x"]]], [[["c", ["k", "f"]], "b"], [["t", "m"], ["9", "7"]]]], [" ", [[[["e", "d"], "p"], ["g", [[["z", "q"], "3"], ["v", "6"]]]], [["r", "l"], ["a", [["1", ["4", "0"]], ["i", "o"]]]]]]];
var HUFFMAN_LOOKUP = { "0": { "v": 223, "l": 8 }, "1": { "v": 31, "l": 7 }, "2": { "v": 12, "l": 6 }, "3": { "v": 91, "l": 7 }, "4": { "v": 95, "l": 8 }, "5": { "v": 104, "l": 8 }, "6": { "v": 123, "l": 7 }, "7": { "v": 30, "l": 5 }, "8": { "v": 8, "l": 6 }, "9": { "v": 14, "l": 5 }, " ": { "v": 1, "l": 2 }, "a": { "v": 15, "l": 5 }, "b": { "v": 10, "l": 4 }, "c": { "v": 2, "l": 5 }, "d": { "v": 35, "l": 6 }, "e": { "v": 3, "l": 6 }, "f": { "v": 50, "l": 6 }, "g": { "v": 11, "l": 5 }, "h": { "v": 24, "l": 5 }, "i": { "v": 63, "l": 7 }, "j": { "v": 232, "l": 9 }, "k": { "v": 18, "l": 6 }, "l": { "v": 23, "l": 5 }, "m": { "v": 22, "l": 5 }, "n": { "v": 44, "l": 6 }, "o": { "v": 127, "l": 7 }, "p": { "v": 19, "l": 5 }, "q": { "v": 155, "l": 8 }, "r": { "v": 7, "l": 5 }, "s": { "v": 4, "l": 4 }, "t": { "v": 6, "l": 5 }, "u": { "v": 16, "l": 5 }, "v": { "v": 59, "l": 7 }, "w": { "v": 0, "l": 5 }, "x": { "v": 28, "l": 5 }, "y": { "v": 40, "l": 7 }, "z": { "v": 27, "l": 8 } };
async function readCharItems(char, reader2, constants, config) {
  char.items = await readItems(
    reader2,
    char.header.version,
    char.header.realm,
    constants,
    config,
    char
  );
}
async function writeCharItems(char, constants, config) {
  const writer2 = new BitWriter();
  writer2.WriteArray(
    await writeItems(
      char.items,
      char.header.version,
      char.header.realm,
      constants,
      config
    )
  );
  return writer2.ToArray();
}
async function readMercItems(char, reader2, constants, config) {
  try {
    char.merc_items = [];
    const header = reader2.ReadString(2);
    if (header !== "jf") {
      if (char?.header.level === 1) {
        return;
      }
      const byteOffset = Math.floor((reader2.offset - 2 * 8) / 8);
      throw te("d2s.parse.items.mercHeaderNotFound", {
        found: header,
        offset: byteOffset
      });
    }
    if (char.header.merc_id && parseInt(char.header.merc_id, 16) !== 0) {
      char.merc_items = await readItems(
        reader2,
        char.header.version,
        char.header.realm,
        constants,
        config,
        char
      );
    }
  } catch (error) {
    throw te(
      "d2s.parse.items.readMercFailed",
      {
        char: formatCharContext(char)
      },
      error
    );
  }
}
async function writeMercItems(char, constants, config) {
  const writer2 = new BitWriter();
  writer2.WriteString("jf", 2);
  if (char.header.merc_id && parseInt(char.header.merc_id, 16) !== 0) {
    char.merc_items = char.merc_items || [];
    writer2.WriteArray(
      await writeItems(
        char.merc_items,
        char.header.version,
        char.header.realm,
        constants,
        config
      )
    );
  }
  return writer2.ToArray();
}
async function readGolemItems(char, reader2, constants, config) {
  try {
    const header = reader2.ReadString(2);
    if (header !== "kf") {
      if (char?.header.level === 1) {
        return;
      }
      const byteOffset = Math.floor((reader2.offset - 2 * 8) / 8);
      throw te("d2s.parse.items.golemHeaderNotFound", {
        found: header,
        offset: byteOffset
      });
    }
    const has_golem = reader2.ReadUInt8();
    if (has_golem === 1) {
      char.golem_item = await readItem(
        reader2,
        char.header.version,
        char.header.realm,
        constants,
        config,
        void 0
      );
    }
  } catch (error) {
    throw te(
      "d2s.parse.items.readGolemFailed",
      {
        char: formatCharContext(char)
      },
      error
    );
  }
}
async function writeGolemItems(char, constants, config) {
  const writer2 = new BitWriter();
  writer2.WriteString("kf", 2);
  if (char.golem_item) {
    writer2.WriteUInt8(1);
    writer2.WriteArray(
      await writeItem(
        char.golem_item,
        char.header.version,
        char.header.realm,
        constants,
        config
      )
    );
  } else {
    writer2.WriteUInt8(0);
  }
  return writer2.ToArray();
}
async function readCorpseItems(char, reader2, constants, config) {
  try {
    char.corpses = [];
    const header = reader2.ReadString(2);
    if (header !== "JM") {
      if (char.header.level === 1) {
        return;
      }
      const byteOffset = Math.floor((reader2.offset - 2 * 8) / 8);
      throw te("d2s.parse.items.corpseHeaderNotFound", {
        found: header,
        offset: byteOffset
      });
    }
    const count = reader2.ReadUInt16();
    for (let i = 0; i < count; i++) {
      try {
        const unknown_4 = reader2.ReadUInt32();
        const x_position = reader2.ReadUInt32();
        const y_position = reader2.ReadUInt32();
        const items = await readItems(
          reader2,
          char.header.version,
          char.header.realm,
          constants,
          config,
          char
        );
        char.corpses.push({ items, unknown_4, x_position, y_position });
      } catch (error) {
        throw te(
          "d2s.parse.items.readCorpseFailed",
          {
            index: i + 1,
            count
          },
          error
        );
      }
    }
  } catch (error) {
    throw te(
      "d2s.parse.items.readCorpseItemsFailed",
      {
        char: formatCharContext(char)
      },
      error
    );
  }
}
async function writeCorpseItem(char, constants, config) {
  const writer2 = new BitWriter();
  writer2.WriteString("JM", 2);
  const corpses = char.corpses ?? [];
  writer2.WriteUInt16(corpses.length);
  for (const corpse of corpses) {
    writer2.WriteUInt32(corpse.unknown_4 ?? 0);
    writer2.WriteUInt32(corpse.x_position ?? 0);
    writer2.WriteUInt32(corpse.y_position ?? 0);
    writer2.WriteArray(
      await writeItems(
        corpse.items ?? [],
        char.header.version,
        char.header.realm,
        constants,
        config
      )
    );
  }
  return writer2.ToArray();
}
async function readItems(reader2, version, realm, constants, config, char) {
  const items = [];
  const header = reader2.ReadString(2);
  if (header !== "JM") {
    if (char?.header.level === 1) {
      return [];
    }
    const byteOffset = Math.floor((reader2.offset - 2 * 8) / 8);
    throw te("d2s.parse.items.listHeaderNotFound", {
      found: header,
      offset: byteOffset
    });
  }
  const count = reader2.ReadUInt16();
  for (let i = 0; i < count; i++) {
    try {
      items.push(
        await readItem(reader2, version, realm, constants, config, void 0)
      );
    } catch (error) {
      if (DEBUG_D2S) {
        console.warn("Previously parsed items", items);
      }
      throw te(
        "d2s.parse.items.readItemFailed",
        {
          index: i + 1,
          count
        },
        error
      );
    }
  }
  return items;
}
async function writeItems(items, version, realm, constants, config) {
  const writer2 = new BitWriter();
  writer2.WriteString("JM", 2);
  writer2.WriteUInt16(items.length);
  for (let i = 0; i < items.length; i++) {
    writer2.WriteArray(
      await writeItem(items[i], version, realm, constants, config)
    );
  }
  return writer2.ToArray();
}
async function readItem(reader2, version, realm, constants, config, _parent) {
  const itemStartOffset = reader2.offset;
  const item = {
    offset: itemStartOffset,
    _unknown_data: {}
  };
  if (DEBUG_D2S) {
    item.hex = extractRawBytes(reader2, itemStartOffset, 100);
  }
  try {
    if (version <= 96) {
      const header = reader2.ReadString(2);
      if (header !== "JM") {
        const byteOffset = Math.floor((reader2.offset - 2 * 8) / 8);
        throw te("d2s.parse.items.itemHeaderNotFound", {
          found: header,
          offset: byteOffset
        });
      }
    }
    item._unknown_data.b0_3 = reader2.ReadBitArray(4);
    item.identified = reader2.ReadBit();
    item._unknown_data.b5_10 = reader2.ReadBitArray(6);
    item.socketed = reader2.ReadBit();
    item._unknown_data.b12 = reader2.ReadBitArray(1);
    item.new = reader2.ReadBit();
    item._unknown_data.b14_15 = reader2.ReadBitArray(2);
    item.is_ear = reader2.ReadBit();
    item.starter_item = reader2.ReadBit();
    item._unknown_data.b18_20 = reader2.ReadBitArray(3);
    item.simple_item = reader2.ReadBit();
    item.ethereal = reader2.ReadBit();
    item._unknown_data.b23 = reader2.ReadBitArray(1);
    item.personalized = reader2.ReadBit();
    item._unknown_data.b25 = reader2.ReadBitArray(1);
    item.given_runeword = reader2.ReadBit();
    item._unknown_data.b27 = reader2.ReadBitArray(1);
    item.has_chronicle_data = reader2.ReadBit() === 1;
    item._unknown_data.b29_31 = reader2.ReadBitArray(3);
    if (version <= 96) {
      item.version = reader2.ReadUInt16(10).toString(10);
    } else if (version >= 97) {
      item.version = reader2.ReadUInt16(3).toString(2);
    }
    item.location_id = reader2.ReadUInt8(3);
    item.equipped_id = reader2.ReadUInt8(4);
    item.position_x = reader2.ReadUInt8(4);
    item.position_y = reader2.ReadUInt8(4);
    item.alt_position_id = reader2.ReadUInt8(3);
    if (item.is_ear) {
      const clazz = reader2.ReadUInt8(3);
      const level = reader2.ReadUInt8(7);
      const arr = new Uint8Array(15);
      for (let i = 0; i < arr.length; i++) {
        arr[i] = reader2.ReadUInt8(7);
        if (arr[i] === 0) {
          break;
        }
      }
      const name = new BitReader(arr).ReadString(15).trim().replace(/\0/g, "");
      item.ear_attributes = {
        class: clazz,
        level,
        name
      };
    } else {
      if (version <= 96) {
        item.type = reader2.ReadString(4);
      } else if (version >= 97) {
        item.type = "";
        for (let i = 0; i < 4; i++) {
          let node = HUFFMAN;
          do {
            node = node[reader2.ReadBit()];
          } while (Array.isArray(node));
          item.type += node;
        }
      }
      item.type = item.type.trim().replace(/\0/g, "");
      let details = _GetItemTXT(item, constants);
      item.categories = details?.c;
      if (item?.categories?.includes("Any Armor")) {
        item.type_id = 1 /* Armor */;
      } else if (item?.categories?.includes("Weapon")) {
        item.type_id = 3 /* Weapon */;
        details = constants.weapon_items[item.type];
      } else {
        item.type_id = 4 /* Other */;
      }
      let bits = item.simple_item ? 1 : 3;
      if (item.categories?.includes("Quest")) {
        item.quest_difficulty = reader2.ReadUInt16(constants.magical_properties[356].sB) - constants.magical_properties[356].sA;
        bits = 1;
      }
      item.nr_of_items_in_sockets = reader2.ReadUInt8(bits);
    }
    if (!item.simple_item) {
      item.id = reader2.ReadUInt32(32);
      item.level = reader2.ReadUInt8(7);
      item.quality = reader2.ReadUInt8(4);
      item.multiple_pictures = reader2.ReadBit();
      if (item.multiple_pictures) {
        item.picture_id = reader2.ReadUInt8(3);
      }
      item.class_specific = reader2.ReadBit();
      if (item.class_specific) {
        item.auto_affix_id = reader2.ReadUInt16(11);
      }
      try {
        switch (item.quality) {
          case 1 /* Low */:
            item.low_quality_id = reader2.ReadUInt8(3);
            break;
          case 2 /* Normal */:
            {
              const bits = reader2.ReadBitArray(12);
              if (bits.every((b) => b === 0) || bits.every((b) => b === 1)) {
                item.normal_12_bits = bits;
              } else {
                item.normal_12_bits = null;
                reader2.SkipBits(-12);
              }
            }
            break;
          case 3 /* Superior */:
            item.file_index = reader2.ReadUInt8(3);
            break;
          case 4 /* Magic */:
            item.magic_prefix = reader2.ReadUInt16(11);
            if (item.magic_prefix)
              item.magic_prefix_name = constants.magic_prefixes[item.magic_prefix] ? constants.magic_prefixes[item.magic_prefix].n : null;
            item.magic_suffix = reader2.ReadUInt16(11);
            if (item.magic_suffix)
              item.magic_suffix_name = constants.magic_suffixes[item.magic_suffix] ? constants.magic_suffixes[item.magic_suffix].n : null;
            break;
          case 5 /* Set */:
            item.set_id = reader2.ReadUInt16(12);
            item.set_name = constants.set_items[item.set_id] ? constants.set_items[item.set_id].n : null;
            break;
          case 7 /* Unique */:
            item.unique_id = reader2.ReadUInt16(12);
            item.unique_name = constants.unq_items[item.unique_id] ? constants.unq_items[item.unique_id].n : null;
            break;
          case 6 /* Rare */:
          case 8 /* Crafted */:
            item.rare_name_id = reader2.ReadUInt8(8);
            if (item.rare_name_id)
              item.rare_name = constants.rare_names[item.rare_name_id] ? constants.rare_names[item.rare_name_id].n : null;
            item.rare_name_id2 = reader2.ReadUInt8(8);
            if (item.rare_name_id2)
              item.rare_name2 = constants.rare_names[item.rare_name_id2] ? constants.rare_names[item.rare_name_id2].n : null;
            item.magical_name_ids = [];
            for (let i = 0; i < 6; i++) {
              const prefix = reader2.ReadBit();
              if (prefix === 1) {
                item.magical_name_ids[i] = reader2.ReadUInt16(11);
              } else {
                item.magical_name_ids[i] = null;
              }
            }
            break;
          default:
            break;
        }
      } catch (error) {
        const qualityNames = [
          "Unknown",
          "Low",
          "Normal",
          "Superior",
          "Magic",
          "Set",
          "Rare",
          "Unique",
          "Crafted"
        ];
        const qualityName = qualityNames[item.quality] || `Unknown(${item.quality})`;
        throw te(
          "d2s.parse.items.readQualityFailed",
          {
            quality: qualityName
          },
          error
        );
      }
      if (item.given_runeword) {
        item.runeword_id = reader2.ReadUInt16(12);
        item._unknown_data.runeword_extra_4 = reader2.ReadUInt8(4);
      }
      if (item.personalized) {
        const arr = new Uint8Array(16);
        for (let i = 0; i < arr.length; i++) {
          if (version > 97) {
            arr[i] = reader2.ReadUInt8(8);
          } else {
            arr[i] = reader2.ReadUInt8(7);
          }
          if (arr[i] === 0) {
            break;
          }
        }
        item.personalized_name = new BitReader(arr).ReadString(16).trim().replace(/\0/g, "");
      }
      if (item.type === "tbk" || item.type === "ibk") {
        item._unknown_data.tome_extra_5 = reader2.ReadUInt8(5);
      }
      item.timestamp = reader2.ReadUInt8(1);
      if (item.type_id === 1 /* Armor */) {
        item.defense_rating = reader2.ReadUInt16(constants.magical_properties[31].sB) - constants.magical_properties[31].sA;
      }
      if (item.type_id === 1 /* Armor */ || item.type_id === 3 /* Weapon */) {
        item.max_durability = reader2.ReadUInt16(constants.magical_properties[73].sB) - constants.magical_properties[73].sA;
        if (item.max_durability > 0) {
          item.current_durability = reader2.ReadUInt16(constants.magical_properties[72].sB) - constants.magical_properties[72].sA;
        }
      }
      if (version >= 105) {
        item.has_quantity = reader2.ReadBit() === 1;
      } else {
        item.has_quantity = constants.stackables[item.type];
      }
      if (item.has_quantity) {
        item.quantity = reader2.ReadUInt16(9);
      }
      if (item.socketed === 1) {
        item.total_nr_of_sockets = reader2.ReadUInt8(4);
      }
      let plist_flag = 0;
      if (item.quality === 5 /* Set */) {
        plist_flag = reader2.ReadUInt8(5);
        item.set_list_count = 0;
        item._unknown_data.plist_flag = plist_flag;
      }
      try {
        let magic_attributes = _readMagicProperties(reader2, constants);
        item.magic_attributes = magic_attributes;
        while (plist_flag > 0) {
          if (plist_flag & 1) {
            item.set_list_count += 1;
            item.set_attributes ?? (item.set_attributes = []);
            item.set_attributes.push(_readMagicProperties(reader2, constants));
          }
          plist_flag >>>= 1;
        }
        if (item.given_runeword === 1) {
          const runewordAttributes = _readMagicProperties(reader2, constants);
          if (runewordAttributes && runewordAttributes.length > 0) {
            item.runeword_attributes = runewordAttributes;
          }
        }
      } catch (error) {
        throw te("d2s.parse.items.readMagicPropsFailed", null, error);
      }
    }
    if (version >= 105 && item.has_chronicle_data) {
      item.chronicle_source = reader2.ReadUInt16();
      item.chronicle_timestamp = reader2.ReadUInt32();
      item.chronicle_suffix = reader2.ReadBitArray(4);
    }
    if (version >= 105) {
      item.has_advanced_stash_quantity = reader2.ReadBit() === 1;
      if (item.has_advanced_stash_quantity) {
        item.advanced_stash_quantity = reader2.ReadUInt8(8);
      }
    }
    reader2.Align();
    if (item.nr_of_items_in_sockets > 0 && item.simple_item === 0) {
      item.socketed_items = [];
      for (let i = 0; i < item.nr_of_items_in_sockets; i++) {
        try {
          item.socketed_items.push(
            await readItem(reader2, version, realm, constants, config, item)
          );
        } catch (error) {
          throw te(
            "d2s.parse.items.readSocketedItemFailed",
            { index: i + 1, count: item.nr_of_items_in_sockets },
            error
          );
        }
      }
    }
    return item;
  } catch (error) {
    throw te(
      "d2s.parse.items.parseItemFailed",
      {
        item: JSON.stringify(item)
      },
      error
    );
  }
}
async function writeItem(item, version, realm, constants, config) {
  if (item._unknown_data === void 0) {
    item._unknown_data = {};
  }
  if (item.categories === void 0) {
    item.categories = _GetItemTXT(item, constants)?.c;
  }
  const writer2 = new BitWriter();
  if (version <= 96) {
    writer2.WriteString("JM", 2);
  }
  writer2.WriteBits(item._unknown_data.b0_3 || new Uint8Array(4), 4);
  writer2.WriteBit(item.identified);
  writer2.WriteBits(item._unknown_data.b5_10 || new Uint8Array(6), 6);
  writer2.WriteBit(item.socketed);
  writer2.WriteBits(item._unknown_data.b12 || new Uint8Array(1), 1);
  writer2.WriteBit(item.new);
  writer2.WriteBits(item._unknown_data.b14_15 || new Uint8Array(2), 2);
  writer2.WriteBit(item.is_ear);
  writer2.WriteBit(item.starter_item);
  writer2.WriteBits(item._unknown_data.b18_20 || new Uint8Array(3), 3);
  writer2.WriteBit(item.simple_item);
  writer2.WriteBit(item.ethereal);
  writer2.WriteBits(item._unknown_data.b23 || new Uint8Array([1]), 1);
  writer2.WriteBit(item.personalized);
  writer2.WriteBits(item._unknown_data.b25 || new Uint8Array(1), 1);
  writer2.WriteBit(item.given_runeword);
  writer2.WriteBits(item._unknown_data.b27 || new Uint8Array(1), 1);
  writer2.WriteBit(item.has_chronicle_data ? 1 : 0);
  writer2.WriteBits(item._unknown_data.b29_31 || new Uint8Array(3), 3);
  const itemVersion = item.version != null ? item.version : "101";
  if (version <= 96) {
    writer2.WriteUInt16(parseInt(itemVersion, 10), 10);
  } else if (version >= 97) {
    writer2.WriteUInt16(parseInt(itemVersion, 2), 3);
  }
  writer2.WriteUInt8(item.location_id, 3);
  writer2.WriteUInt8(item.equipped_id, 4);
  writer2.WriteUInt8(item.position_x, 4);
  writer2.WriteUInt8(item.position_y, 4);
  writer2.WriteUInt8(item.alt_position_id, 3);
  if (item.is_ear) {
    writer2.WriteUInt8(item.ear_attributes.class, 3);
    writer2.WriteUInt8(item.ear_attributes.level, 7);
    const name = item.ear_attributes.name.substring(0, 15);
    for (let i = 0; i < name.length; i++) {
      writer2.WriteUInt8(name.charCodeAt(i) & 127, 7);
    }
    writer2.WriteUInt8(0, 7);
  } else {
    const t = item.type.padEnd(4, " ");
    if (version <= 96) {
      writer2.WriteString(t, 4);
    } else {
      for (const c of t) {
        const n = HUFFMAN_LOOKUP[c];
        writer2.WriteUInt16(n.v, n.l);
      }
    }
    let bits = item.simple_item ? 1 : 3;
    if (item.categories?.includes("Quest")) {
      const difficulty = item.quest_difficulty || 0;
      writer2.WriteUInt16(
        difficulty + constants.magical_properties[356].sA,
        constants.magical_properties[356].sB
      );
      bits = 1;
    }
    writer2.WriteUInt8(item.nr_of_items_in_sockets, bits);
  }
  if (!item.simple_item) {
    writer2.WriteUInt32(item.id, 32);
    writer2.WriteUInt8(item.level, 7);
    writer2.WriteUInt8(item.quality, 4);
    writer2.WriteUInt8(item.multiple_pictures, 1);
    if (item.multiple_pictures) {
      writer2.WriteUInt8(item.picture_id, 3);
    }
    writer2.WriteUInt8(item.class_specific, 1);
    if (item.class_specific === 1) {
      writer2.WriteUInt16(item.auto_affix_id || 0, 11);
    }
    switch (item.quality) {
      case 1 /* Low */:
        writer2.WriteUInt8(item.low_quality_id, 3);
        break;
      case 2 /* Normal */:
        if (item.normal_12_bits != null) {
          writer2.WriteBits(item.normal_12_bits, 12);
        }
        break;
      case 3 /* Superior */:
        writer2.WriteUInt8(item.file_index || 0, 3);
        break;
      case 4 /* Magic */:
        writer2.WriteUInt16(item.magic_prefix, 11);
        writer2.WriteUInt16(item.magic_suffix, 11);
        break;
      case 5 /* Set */:
        writer2.WriteUInt16(item.set_id, 12);
        break;
      case 7 /* Unique */:
        writer2.WriteUInt16(item.unique_id, 12);
        break;
      case 6 /* Rare */:
      case 8 /* Crafted */:
        writer2.WriteUInt8(
          item.rare_name_id !== void 0 ? item.rare_name_id : _lookupRareId(item.rare_name, constants),
          8
        );
        writer2.WriteUInt8(
          item.rare_name_id2 !== void 0 ? item.rare_name_id2 : _lookupRareId(item.rare_name2, constants),
          8
        );
        for (let i = 0; i < 6; i++) {
          const magical_name_id = item.magical_name_ids[i];
          if (magical_name_id) {
            writer2.WriteBit(1);
            writer2.WriteUInt16(magical_name_id, 11);
          } else {
            writer2.WriteBit(0);
          }
        }
        break;
      default:
        break;
    }
    if (item.given_runeword) {
      let runeword_id = item.runeword_id;
      if (runeword_id == 2718) {
        runeword_id = 48;
      }
      writer2.WriteUInt16(runeword_id, 12);
      writer2.WriteUInt8(item._unknown_data.runeword_extra_4 ?? 5, 4);
    }
    if (item.personalized) {
      const name = item.personalized_name.substring(0, 16);
      for (let i = 0; i < name.length; i++) {
        if (version > 97) {
          writer2.WriteUInt8(name.charCodeAt(i), 8);
        } else {
          writer2.WriteUInt8(name.charCodeAt(i) & 127, 7);
        }
      }
      writer2.WriteUInt8(0, version > 97 ? 8 : 7);
    }
    if (item.type === "tbk" || item.type === "ibk") {
      writer2.WriteUInt8(
        item._unknown_data.tome_extra_5 ?? (item.type === "ibk" ? 1 : 0),
        5
      );
    }
    writer2.WriteUInt8(item.timestamp, 1);
    if (item.type_id === 1 /* Armor */ || item.type_id === 2 /* Shield */) {
      writer2.WriteUInt16(
        item.defense_rating + constants.magical_properties[31].sA,
        constants.magical_properties[31].sB
      );
    }
    if (item.type_id === 1 /* Armor */ || item.type_id === 2 /* Shield */ || item.type_id === 3 /* Weapon */) {
      writer2.WriteUInt16(
        item.max_durability || 0,
        constants.magical_properties[73].sB
      );
      if (item.max_durability > 0) {
        writer2.WriteUInt16(
          item.current_durability,
          constants.magical_properties[72].sB
        );
      }
    }
    if (version >= 105) {
      writer2.WriteBit(item.has_quantity ? 1 : 0);
    }
    if (item.has_quantity) {
      writer2.WriteUInt16(item.quantity, 9);
    }
    if (item.socketed === 1) {
      writer2.WriteUInt8(item.total_nr_of_sockets, 4);
    }
    if (item.quality === 5 /* Set */) {
      const set_attribute_count = item.set_attributes != null ? item.set_attributes.length : 0;
      const plist_flag = (1 << set_attribute_count) - 1;
      writer2.WriteUInt8(item._unknown_data.plist_flag || plist_flag, 5);
    }
    _writeMagicProperties(writer2, item.magic_attributes, constants);
    if (item.set_attributes && item.set_attributes.length > 0) {
      for (let i = 0; i < item.set_attributes.length; i++) {
        _writeMagicProperties(writer2, item.set_attributes[i], constants);
      }
    }
    if (item.given_runeword === 1) {
      _writeMagicProperties(writer2, item.runeword_attributes, constants);
    }
  }
  if (version >= 105 && item.has_chronicle_data) {
    writer2.WriteUInt16(item.chronicle_source ?? 0);
    writer2.WriteUInt32(item.chronicle_timestamp ?? 0);
    writer2.WriteBits(item.chronicle_suffix ?? new Uint8Array([0, 0, 0, 0]), 4);
  }
  if (version >= 105) {
    writer2.WriteBit(item.advanced_stash_quantity ? 1 : 0);
    if (item.has_advanced_stash_quantity) {
      writer2.WriteUInt8(item.advanced_stash_quantity ?? 1, 8);
    }
  }
  writer2.Align();
  if (item.nr_of_items_in_sockets > 0 && item.simple_item === 0) {
    for (let i = 0; i < item.nr_of_items_in_sockets; i++) {
      writer2.WriteArray(
        await writeItem(
          item.socketed_items[i],
          version,
          realm,
          constants,
          config
        )
      );
    }
  }
  return writer2.ToArray();
}
function _lookupRareId(name, constants) {
  return constants.rare_names.findIndex(
    (k) => k && (k.n.toLowerCase().startsWith(name.toLowerCase()) || name.toLowerCase().startsWith(k.n.toLowerCase()))
  );
}
function _readMagicProperties(reader2, constants) {
  let id = reader2.ReadUInt16(9);
  const magic_attributes = [];
  while (id != 511) {
    const values = [];
    const propertyStartOffset = reader2.offset - 9;
    if (constants.magical_properties[id] == null) {
      throw te("d2s.parse.items.unknownStatId", {
        id,
        offset: propertyStartOffset
      });
    }
    try {
      const num_of_properties = constants.magical_properties[id].np || 1;
      for (let i = 0; i < num_of_properties; i++) {
        const prop = constants.magical_properties[id + i];
        if (prop == null) {
          throw te("d2s.parse.items.unknownSubStatId", {
            id: id + i,
            propIndex: i + 1,
            propCount: num_of_properties,
            statId: id,
            offset: reader2.offset
          });
        }
        if (prop.sP) {
          let param = reader2.ReadUInt16(prop.sP);
          switch (prop.dF) {
            case 14:
              values.push(param & 7);
              param = param >> 3 & 8191;
              break;
            default:
              break;
          }
          switch (prop.e) {
            case 1:
              break;
            case 2:
            //chance to cast
            case 3:
              values.push(param & 63);
              param = param >> 6 & 1023;
              break;
            default:
              break;
          }
          values.push(param);
        }
        if (!prop.sB) {
          throw te("d2s.parse.items.missingBits", {
            stat: prop.s,
            id
          });
        }
        let v = reader2.ReadUInt16(prop.sB);
        if (prop.sA) {
          v -= prop.sA;
        }
        switch (prop.e) {
          case 3:
            values.push(v & 255);
            values.push(v >> 8 & 255);
            break;
          default:
            values.push(v);
            break;
        }
      }
      magic_attributes.push({
        id,
        values,
        name: constants.magical_properties[id].s
      });
    } catch (error) {
      const statName = constants.magical_properties[id]?.s || `Unknown(${id})`;
      throw te(
        "d2s.parse.items.readMagicPropFailed",
        {
          stat: statName,
          id,
          offset: propertyStartOffset
        },
        error
      );
    }
    id = reader2.ReadUInt16(9);
  }
  return magic_attributes;
}
function _writeMagicProperties(writer2, properties, constants) {
  if (properties) {
    for (let i = 0; i < properties.length; i++) {
      const property = properties[i];
      let valueIdx = 0;
      writer2.WriteUInt16(property.id, 9);
      const num_of_properties = constants.magical_properties[property.id].np || 1;
      for (let j = 0; j < num_of_properties; j++) {
        const prop = constants.magical_properties[property.id + j];
        if (prop == null) {
          throw te("d2s.parse.items.writeUnknownPropId", {
            id: property.id
          });
        }
        if (prop.sP) {
          let param = property.values[valueIdx++];
          switch (prop.dF) {
            case 14:
              param |= (property.values[valueIdx++] & 8191) << 3;
              break;
            default:
              break;
          }
          switch (prop.e) {
            case 1:
              break;
            case 2:
            //chance to cast
            case 3:
              param |= (property.values[valueIdx++] & 1023) << 6;
              break;
            default:
              break;
          }
          writer2.WriteUInt32(param, prop.sP);
        }
        let v = property.values[valueIdx++];
        if (prop.sA) {
          v += prop.sA;
        }
        switch (prop.e) {
          case 3:
            v |= (property.values[valueIdx++] & 255) << 8;
            break;
          default:
            break;
        }
        if (!prop.sB) {
          throw te("d2s.parse.items.writeMissingBits", {
            id: property.id,
            stat: prop.s
          });
        }
        writer2.WriteUInt32(v, prop.sB);
      }
    }
  }
  writer2.WriteUInt16(511, 9);
}
function _GetItemTXT(item, constants) {
  if (constants.armor_items[item.type]) {
    return constants.armor_items[item.type];
  } else if (constants.weapon_items[item.type]) {
    return constants.weapon_items[item.type];
  } else if (constants.other_items[item.type]) {
    return constants.other_items[item.type];
  }
}

// scripts/vendor-d2s/src/d2/skills.ts
async function readSkills(char, reader2, constants) {
  try {
    char.skills = [];
    const characterClassCode = constants.classes[char.header.class_id].c;
    const offset = constants.skills.findIndex(
      (skill) => skill && skill.c === characterClassCode
    );
    const skillCount = constants.skills.filter(
      (skill) => skill && skill.c === characterClassCode
    ).length;
    if (offset === -1 || skillCount === 0) {
      const characterClass = constants.classes[char.header.class_id].n;
      throw te("d2s.parse.skills.classNotFound", {
        class: characterClass,
        code: characterClassCode
      });
    }
    const header = reader2.ReadString(2);
    if (header !== "if") {
      if (char.header.level === 1) {
        return;
      }
      const byteOffset = Math.floor((reader2.offset - 2 * 8) / 8);
      throw te("d2s.parse.skills.headerNotFound", {
        found: header,
        offset: byteOffset
      });
    }
    for (let i = 0; i < skillCount; i++) {
      const id = offset + i;
      try {
        const points = reader2.ReadUInt8();
        char.skills.push({ id, points });
      } catch (error) {
        throw te(
          "d2s.parse.skills.readSkillFailed",
          {
            index: i + 1,
            count: skillCount,
            id
          },
          error
        );
      }
    }
  } catch (error) {
    throw te(
      "d2s.parse.skills.readFailed",
      {
        char: formatCharContext(char)
      },
      error
    );
  }
}
async function writeSkills(char, _constants) {
  try {
    const writer2 = new BitWriter();
    writer2.WriteString("if", 2);
    if (!char.skills || char.skills.length === 0) {
      throw te("d2s.parse.skills.noSkills");
    }
    for (let i = 0; i < char.skills.length; i++) {
      writer2.WriteUInt8(char.skills[i].points);
    }
    return writer2.ToArray();
  } catch (error) {
    throw te(
      "d2s.parse.skills.writeFailed",
      {
        char: formatCharContext(char)
      },
      error
    );
  }
}

// scripts/vendor-d2s/src/d2/d2s.ts
var defaultConfig = {};
function reader(buffer) {
  return new BitReader(buffer);
}
async function read(buffer, constants, userConfig) {
  const char = {};
  try {
    const reader2 = new BitReader(buffer);
    const config = Object.assign(defaultConfig, userConfig);
    try {
      await readHeader2(char, reader2);
    } catch (error) {
      throw te("d2s.parse.d2s.headerFailed", null, error);
    }
    try {
      if (!constants) {
        constants = getConstantData(char.header.version);
      }
    } catch (error) {
      throw te(
        "d2s.parse.d2s.constantsFailed",
        {
          version: char.header.version
        },
        error
      );
    }
    try {
      await readHeaderData(char, reader2, constants);
    } catch (error) {
      throw te("d2s.parse.d2s.headerDataFailed", null, error);
    }
    try {
      await readAttributes(char, reader2, constants);
    } catch (error) {
      throw te("d2s.parse.d2s.attributesFailed", null, error);
    }
    try {
      await readSkills(char, reader2, constants);
    } catch (error) {
      throw te(
        "d2s.parse.d2s.skillsFailed",
        {
          char: formatCharContext(char)
        },
        error
      );
    }
    try {
      await readCharItems(char, reader2, constants, config);
    } catch (error) {
      throw te(
        "d2s.parse.d2s.charItemsFailed",
        {
          char: formatCharContext(char)
        },
        error
      );
    }
    try {
      await readCorpseItems(char, reader2, constants, config);
    } catch (error) {
      throw te(
        "d2s.parse.d2s.corpseItemsFailed",
        {
          char: formatCharContext(char)
        },
        error
      );
    }
    if (
      // this feels a bit janky...
      char.header.status.expansion || char.header.realm === 2 || char.header.realm === 3
    ) {
      try {
        await readMercItems(char, reader2, constants, config);
      } catch (error) {
        throw te(
          "d2s.parse.d2s.mercItemsFailed",
          {
            char: formatCharContext(char)
          },
          error
        );
      }
      try {
        await readGolemItems(char, reader2, constants, config);
      } catch (error) {
        throw te(
          "d2s.parse.d2s.golemItemFailed",
          {
            char: formatCharContext(char)
          },
          error
        );
      }
      if (char.header.version === 105 && char.header.realm === 3) {
        try {
          await readDemonData(char, reader2, constants, config);
        } catch (error) {
          throw te(
            "d2s.parse.d2s.demonDataFailed",
            {
              char: formatCharContext(char)
            },
            error
          );
        }
      }
    }
    return char;
  } catch (error) {
    if (DEBUG_D2S) {
      console.warn("Character read so far", char);
    }
    throw te(
      "d2s.parse.d2s.readCharFailed",
      {
        char: formatCharContext(char)
      },
      error
    );
  }
}
async function readItem2(buffer, version, realm, constants, userConfig) {
  try {
    const reader2 = new BitReader(buffer);
    const config = Object.assign(defaultConfig, userConfig);
    if (!constants) {
      constants = getConstantData(version);
    }
    const item = await readItem(
      reader2,
      version,
      realm,
      constants,
      config
    );
    return item;
  } catch (error) {
    throw te(
      "d2s.parse.d2s.parseItemFailed",
      {
        version
      },
      error
    );
  }
}
function writer(_buffer) {
  return new BitWriter();
}
async function write(data, constants, userConfig) {
  const config = Object.assign(defaultConfig, userConfig);
  const writer2 = new BitWriter();
  writer2.WriteArray(await writeHeader2(data));
  if (!constants) {
    constants = getConstantData(data.header.version);
  }
  writer2.WriteArray(await writeHeaderData(data, constants));
  writer2.WriteArray(await writeAttributes(data, constants));
  writer2.WriteArray(await writeSkills(data, constants));
  writer2.WriteArray(await writeCharItems(data, constants, config));
  writer2.WriteArray(await writeCorpseItem(data, constants, config));
  if (data.header.status.expansion || data.header.realm === 2 || data.header.realm === 3) {
    writer2.WriteArray(await writeMercItems(data, constants, config));
    writer2.WriteArray(await writeGolemItems(data, constants, config));
    if (data.header.version === 105 && data.header.realm === 3) {
      writer2.WriteArray(await writeDemonData(data, constants, config));
    }
  }
  await fixHeader(writer2);
  return writer2.ToArray();
}
async function writeItem2(item, version, realm, constants, userConfig) {
  const config = Object.assign(defaultConfig, userConfig);
  const writer2 = new BitWriter();
  if (!constants) {
    constants = getConstantData(version);
  }
  writer2.WriteArray(
    await writeItem(item, version, realm, constants, config)
  );
  return writer2.ToArray();
}
async function readDemonData(char, reader2, _constants, _config) {
  try {
    const header = reader2.ReadString(4);
    if (header === "\0lf") {
      char.has_demon = reader2.ReadUInt16();
      if (char.has_demon) {
        const demon = { _unknown_data: {} };
        demon._unknown_data.b0_2 = reader2.ReadBytes(3);
        demon.is_super_unique = reader2.ReadUInt16();
        demon.index = reader2.ReadUInt16();
        demon._unknown_data.b7_12 = reader2.ReadBytes(6);
        demon.difficulty = reader2.ReadUInt8();
        demon._unknown_data.b14_24 = reader2.ReadBytes(11);
        demon.level_id = reader2.ReadUInt16();
        demon._unknown_data.b27_28 = reader2.ReadBytes(2);
        demon.level = reader2.ReadUInt8();
        demon.is_desecrated = reader2.ReadUInt8();
        demon._unknown_data.b31_52 = reader2.ReadBytes(22);
        demon.difficulty2 = reader2.ReadUInt8();
        demon._unknown_data.b54_56 = reader2.ReadBytes(3);
        demon.difficulty3 = reader2.ReadUInt8();
        demon._unknown_data.b58_80 = reader2.ReadBytes(23);
        demon.mods = Array.from(reader2.ReadBytes(9));
        demon.stats = reader2.ReadBytes(26);
        char.demon = demon;
      }
    } else {
      if (char?.header.level === 1) {
        return;
      }
      throw te("d2s.parse.demon.demonHeaderNotFound", {
        found: header,
        offset: Math.floor((reader2.offset - 4 * 8) / 8)
      });
    }
  } catch (error) {
    throw te(
      "d2s.parse.demon.readDemonFailed",
      {
        char: formatCharContext(char)
      },
      error
    );
  }
}
async function writeDemonData(char, _constants, _config) {
  const writer2 = new BitWriter();
  writer2.WriteString("\0lf", 4);
  writer2.WriteUInt16(char.has_demon ?? 0);
  if (char.has_demon && char.demon) {
    const demon = char.demon;
    writer2.WriteBytes(demon._unknown_data.b0_2 ?? new Uint8Array(3));
    writer2.WriteUInt16(demon.is_super_unique ?? 0);
    writer2.WriteUInt16(demon.index ?? 0);
    writer2.WriteBytes(demon._unknown_data.b7_12 ?? new Uint8Array(6));
    writer2.WriteUInt8(demon.difficulty ?? 0);
    writer2.WriteBytes(demon._unknown_data.b14_24 ?? new Uint8Array(11));
    writer2.WriteUInt16(demon.level_id ?? 0);
    writer2.WriteBytes(demon._unknown_data.b27_28 ?? new Uint8Array(2));
    writer2.WriteUInt8(demon.level ?? 0);
    writer2.WriteUInt8(demon.is_desecrated ?? 0);
    writer2.WriteBytes(demon._unknown_data.b31_52 ?? new Uint8Array(22));
    writer2.WriteUInt8(demon.difficulty2 ?? 0);
    writer2.WriteBytes(demon._unknown_data.b54_56 ?? new Uint8Array(3));
    writer2.WriteUInt8(demon.difficulty3 ?? 0);
    writer2.WriteBytes(demon._unknown_data.b58_80 ?? new Uint8Array(23));
    writer2.WriteBytes(
      demon.mods ? Uint8Array.from(demon.mods) : new Uint8Array(9)
    );
    writer2.WriteBytes(demon.stats ?? new Uint8Array(26));
  }
  return writer2.ToArray();
}

// scripts/vendor-d2s/src/d2/stash.ts
var stash_exports = {};
__export(stash_exports, {
  read: () => read2,
  write: () => write2
});
var defaultConfig2 = {};
async function read2(buffer, version, realm, constants, _userConfig) {
  const stash = {};
  const reader2 = new BitReader(buffer);
  const firstHeader = reader2.ReadUInt32();
  reader2.SeekByte(0);
  if (firstHeader == 2857740885) {
    stash.pages = [];
    let pageCount = 0;
    while (reader2.offset < reader2.bits.length) {
      pageCount++;
      const { sectionSize, sectionType, sharedGold } = readStashHeader(
        stash,
        reader2
      );
      const saveVersion = version || parseInt(stash.version);
      if (!constants) {
        constants = getConstantData(saveVersion);
      }
      if (sectionType === 2) {
        const dataBytes = sectionSize - 64;
        stash.chronicle = reader2.ReadBytes(dataBytes);
      } else {
        try {
          await readStashPart(
            stash,
            reader2,
            saveVersion,
            realm,
            constants,
            sectionType,
            sharedGold
          );
        } catch (error) {
          throw te(
            "d2s.parse.stash.parseSectionFailed",
            {
              section: pageCount
            },
            error
          );
        }
      }
    }
    stash.pageCount = pageCount;
  } else {
    const { sharedGold } = readStashHeader(stash, reader2);
    const saveVersion = version || parseInt(stash.version);
    if (!constants) {
      constants = getConstantData(saveVersion);
    }
    await readStashPages(stash, reader2, saveVersion, realm, constants);
    if (stash.pages.length > 0) {
      stash.pages[0].sharedGold = sharedGold;
    }
  }
  return stash;
}
function readStashHeader(stash, reader2) {
  const header = reader2.ReadUInt32();
  switch (header) {
    // Resurrected
    case 2857740885: {
      stash.type = "shared";
      stash.kind = reader2.ReadUInt32();
      stash.version = reader2.ReadUInt32().toString();
      const sharedGold2 = reader2.ReadUInt32();
      const sectionSize = reader2.ReadUInt32();
      const sectionType = reader2.ReadUInt8(8);
      reader2.SkipBytes(43);
      return { sectionSize, sectionType, sharedGold: sharedGold2 };
    }
    // LoD
    case 5460819:
    // SSS
    case 1297371971:
      stash.version = reader2.ReadString(2);
      if (stash.version !== "01" && stash.version !== "02") {
        throw te("d2s.parse.stash.unknownVersion", {
          version: stash.version,
          position: reader2.offset - 2 * 8
        });
      }
      stash.type = header === 5460819 ? "shared" : "private";
      let sharedGold = 0;
      if (stash.type === "shared" && stash.version == "02") {
        sharedGold = reader2.ReadUInt32();
      }
      if (stash.type === "private") {
        reader2.ReadUInt32();
        sharedGold = 0;
      }
      stash.pageCount = reader2.ReadUInt32();
      return { sectionSize: 0, sectionType: 0, sharedGold };
    default:
      throw te("d2s.parse.stash.headerNotFound", {
        position: reader2.offset - 3 * 8
      });
  }
}
async function readStashPages(stash, reader2, version, realm, constants) {
  stash.pages = [];
  for (let i = 0; i < stash.pageCount; i++) {
    try {
      await readStashPage(stash, reader2, version, realm, constants);
    } catch (error) {
      throw te(
        "d2s.parse.stash.parsePageFailed",
        {
          index: i + 1,
          count: stash.pageCount
        },
        error
      );
    }
  }
}
async function readStashPage(stash, reader2, version, realm, constants) {
  const page = {
    items: [],
    name: "",
    type: 0
  };
  const header = reader2.ReadString(2);
  if (header !== "ST") {
    throw te("d2s.parse.stash.pageHeaderNotFound", {
      position: reader2.offset - 2 * 8
    });
  }
  page.type = reader2.ReadUInt32();
  page.name = reader2.ReadNullTerminatedString();
  try {
    page.items = await readItems(
      reader2,
      version,
      realm,
      constants,
      defaultConfig2
    );
  } catch (e) {
    if (DEBUG_D2S) {
      console.warn("Previously parsed stash page", page);
    }
    throw e;
  }
  stash.pages.push(page);
}
async function readStashPart(stash, reader2, version, realm, constants, sectionType, sharedGold) {
  const page = {
    items: [],
    name: "",
    type: 0,
    sectionType,
    sharedGold
  };
  try {
    page.items = await readItems(
      reader2,
      version,
      realm,
      constants,
      defaultConfig2
    );
  } catch (e) {
    if (DEBUG_D2S) {
      console.warn("Previously parsed stash page", page);
    }
    throw e;
  }
  stash.pages.push(page);
}
async function write2(data, version, realm, constants, userConfig) {
  const config = Object.assign(defaultConfig2, userConfig);
  const writer2 = new BitWriter();
  version ?? (version = parseInt(data.version, 10));
  if (!constants) {
    constants = getConstantData(version);
  }
  if (version > 97) {
    for (const page of data.pages) {
      writer2.WriteArray(
        await writeStashSection(data, version, realm, constants, config, page)
      );
    }
    if (data.chronicle) {
      writer2.WriteArray(writeChronicle(data, version, data.chronicle));
    }
  } else {
    writer2.WriteArray(await writeStashHeader(data));
    writer2.WriteArray(
      await writeStashPages(data, version, realm, constants, config)
    );
  }
  return writer2.ToArray();
}
async function writeStashHeader(data) {
  const writer2 = new BitWriter();
  if (data.type === "private") {
    writer2.WriteString("CSTM", 4);
  } else {
    writer2.WriteString("SSS", 4);
  }
  writer2.WriteString(data.version, data.version.length);
  if (data.type === "private") {
    writer2.WriteString("", 4);
  } else {
    if (data.version == "02") {
      writer2.WriteUInt32(data.pages[0]?.sharedGold ?? 0);
    }
  }
  writer2.WriteUInt32(data.pages.length);
  return writer2.ToArray();
}
async function writeStashSection(data, version, realm, constants, userConfig, page) {
  const writer2 = new BitWriter();
  writer2.WriteUInt32(2857740885);
  writer2.WriteUInt32(data.kind);
  writer2.WriteUInt32(version);
  writer2.WriteUInt32(page.sharedGold ?? 0);
  writer2.WriteUInt32(0);
  const padding = new Uint8Array(44);
  padding[0] = page.sectionType ?? 0;
  writer2.WriteBytes(padding);
  writer2.WriteArray(
    await writeItems(page.items, version, realm, constants, userConfig)
  );
  const size = writer2.offset;
  writer2.SeekByte(16);
  writer2.WriteUInt32(Math.ceil(size / 8));
  return writer2.ToArray();
}
function writeChronicle(data, version, chronicle) {
  const writer2 = new BitWriter();
  writer2.WriteUInt32(2857740885);
  writer2.WriteUInt32(data.kind);
  writer2.WriteUInt32(version);
  writer2.WriteUInt32(0);
  writer2.WriteUInt32(0);
  const padding = new Uint8Array(44);
  padding[0] = 2;
  writer2.WriteBytes(padding);
  writer2.WriteBytes(chronicle);
  const size = writer2.offset;
  writer2.SeekByte(16);
  writer2.WriteUInt32(Math.ceil(size / 8));
  return writer2.ToArray();
}
async function writeStashPages(data, version, realm, constants, config) {
  const writer2 = new BitWriter();
  for (let i = 0; i < data.pages.length; i++) {
    writer2.WriteArray(
      await writeStashPage(data.pages[i], version, realm, constants, config)
    );
  }
  return writer2.ToArray();
}
async function writeStashPage(data, version, realm, constants, config) {
  const writer2 = new BitWriter();
  writer2.WriteString("ST", 2);
  writer2.WriteUInt32(data.type);
  writer2.WriteString(data.name, data.name.length + 1);
  writer2.WriteArray(
    await writeItems(data.items, version, realm, constants, config)
  );
  return writer2.ToArray();
}

// scripts/vendor-d2s/src/data/parser.ts
function readConstantData(buffers) {
  const constants = {};
  const strings = {
    ...parseJSONStrings(getBuffer(buffers, "item-gems.json")),
    ...parseJSONStrings(getBuffer(buffers, "item-modifiers.json")),
    ...parseJSONStrings(getBuffer(buffers, "item-nameaffixes.json")),
    ...parseJSONStrings(getBuffer(buffers, "item-names.json")),
    ...parseJSONStrings(getBuffer(buffers, "item-runes.json")),
    ...parseJSONStrings(getBuffer(buffers, "skills.json"))
  };
  constants.waypoint_acts = _readWaypointActs(
    parseTSV(getBuffer(buffers, "actinfo.txt")),
    parseTSV(getBuffer(buffers, "levels.txt"))
  );
  constants.classes = _readClasses(
    parseTSV(getBuffer(buffers, "charstats.txt")),
    parseTSV(getBuffer(buffers, "playerclass.txt")),
    strings
  );
  const skillDescs = _readSkillDesc(
    parseTSV(getBuffer(buffers, "skilldesc.txt")),
    strings
  );
  constants.skills = _readSkills(
    parseTSV(getBuffer(buffers, "skills.txt")),
    skillDescs,
    strings
  );
  constants.rare_names = [null].concat(
    _readRareNames(parseTSV(getBuffer(buffers, "raresuffix.txt")), 1, strings)
  );
  constants.rare_names = constants.rare_names.concat(
    _readRareNames(
      parseTSV(getBuffer(buffers, "rareprefix.txt")),
      constants.rare_names.length,
      strings
    )
  );
  constants.magic_prefixes = _readMagicNames(
    parseTSV(getBuffer(buffers, "magicprefix.txt")),
    strings
  );
  constants.magic_suffixes = _readMagicNames(
    parseTSV(getBuffer(buffers, "magicsuffix.txt")),
    strings
  );
  constants.properties = _readProperties(
    parseTSV(getBuffer(buffers, "properties.txt")),
    strings
  );
  constants.magical_properties = _readItemStatCosts(
    parseTSV(getBuffer(buffers, "itemstatcost.txt")),
    strings
  );
  constants.runewords = _readRunewords(
    parseTSV(getBuffer(buffers, "runes.txt")),
    strings
  );
  constants.set_items = _readSetOrUnqItems(
    parseTSV(getBuffer(buffers, "setitems.txt")),
    strings
  );
  constants.unq_items = _readSetOrUnqItems(
    parseTSV(getBuffer(buffers, "uniqueitems.txt")),
    strings
  );
  const item_types = _readTypes(
    parseTSV(getBuffer(buffers, "itemtypes.txt")),
    strings
  );
  const armor_items = _readItems(
    parseTSV(getBuffer(buffers, "armor.txt")),
    item_types,
    strings
  );
  const weapon_items = _readItems(
    parseTSV(getBuffer(buffers, "weapons.txt")),
    item_types,
    strings
  );
  const other_items = _readItems(
    parseTSV(getBuffer(buffers, "misc.txt")),
    item_types,
    strings
  );
  constants.stackables = {};
  [...armor_items, ...weapon_items, ...other_items].filter((item) => item.s === 1).map((item) => constants.stackables[item.code] = { n: item.n });
  constants.armor_items = {};
  armor_items.map((item) => {
    constants.armor_items[item.code] = item;
    delete item.code;
  });
  constants.weapon_items = {};
  weapon_items.map((item) => {
    constants.weapon_items[item.code] = item;
    delete item.code;
  });
  constants.other_items = {};
  other_items.map((item) => {
    constants.other_items[item.code] = item;
    delete item.code;
  });
  _readGems(
    constants.other_items,
    parseTSV(getBuffer(buffers, "gems.txt")),
    strings
  );
  return constants;
}
function getBuffer(files, name) {
  const buffer = files[name];
  if (buffer == null) {
    throw new Error(`Missing buffer for "${name}".`);
  }
  return buffer;
}
function parseTSV(file) {
  const lines = file.split(/\r?\n/).map((line) => line.split(/\t/));
  const header = lines[0];
  return {
    header,
    lines
  };
}
function parseJSONStrings(file) {
  const result = {};
  if (file.charCodeAt(0) === 65279) {
    file = file.slice(1);
  }
  const data = JSON.parse(file);
  for (const str of data) {
    result[str.Key] = str.enUS;
  }
  return result;
}
function _readWaypointActs(actinfoTsv, levelsTsv) {
  const cName = levelsTsv.header.indexOf("Name");
  const cLevelName = levelsTsv.header.indexOf("LevelName");
  const nameToLevelName = /* @__PURE__ */ new Map();
  for (let i = 1; i < levelsTsv.lines.length; i++) {
    const name = levelsTsv.lines[i][cName];
    const levelName = levelsTsv.lines[i][cLevelName];
    if (name && levelName) {
      nameToLevelName.set(name, levelName);
    }
  }
  const waypointCols = [];
  for (let j = 1; j <= 9; j++) {
    waypointCols.push(actinfoTsv.header.indexOf(`waypoint${j}`));
  }
  const result = [];
  for (let i = 1; i < actinfoTsv.lines.length; i++) {
    const line = actinfoTsv.lines[i];
    if (!line[0]) continue;
    const levelNames = [];
    for (const col of waypointCols) {
      const levelName = line[col];
      if (!levelName) break;
      const resolvedLevelName = nameToLevelName.get(levelName);
      if (resolvedLevelName) levelNames.push(resolvedLevelName);
    }
    result.push(levelNames);
  }
  return result;
}
function _readClasses(tsv, tsv2, strings) {
  const arr = [];
  const cClass = tsv.header.indexOf("class");
  const cStr = tsv.header.indexOf("str");
  const cDex = tsv.header.indexOf("dex");
  const cInt = tsv.header.indexOf("int");
  const cVit = tsv.header.indexOf("vit");
  const cStam = tsv.header.indexOf("stamina");
  const cHpadd = tsv.header.indexOf("hpadd");
  const cLifePerLvl = tsv.header.indexOf("LifePerLevel");
  const cStamPerLvl = tsv.header.indexOf("StaminaPerLevel");
  const cManaPerLvl = tsv.header.indexOf("ManaPerLevel");
  const cLifePerVit = tsv.header.indexOf("LifePerVitality");
  const cStamPerVit = tsv.header.indexOf("StaminaPerVitality");
  const cManaPerMag = tsv.header.indexOf("ManaPerMagic");
  const cAllSkills = tsv.header.indexOf("StrAllSkills");
  const cSkillTab1 = tsv.header.indexOf("StrSkillTab1");
  const cSkillTab2 = tsv.header.indexOf("StrSkillTab2");
  const cSkillTab3 = tsv.header.indexOf("StrSkillTab3");
  const cClassOnly = tsv.header.indexOf("StrClassOnly");
  const cCode = tsv2.header.indexOf("Code");
  let id = 0;
  for (let i = 1; i < tsv.lines.length; i++) {
    const clazz = tsv.lines[i][cClass];
    if (clazz && clazz != "Expansion") {
      arr[id] = {
        n: clazz,
        c: tsv2.lines[i][cCode],
        as: strings[tsv.lines[i][cAllSkills]],
        ts: [
          strings[tsv.lines[i][cSkillTab1]],
          strings[tsv.lines[i][cSkillTab2]],
          strings[tsv.lines[i][cSkillTab3]]
        ],
        co: strings[tsv.lines[i][cClassOnly]],
        s: {
          lpl: +tsv.lines[i][cLifePerLvl],
          mpl: +tsv.lines[i][cManaPerLvl],
          spl: +tsv.lines[i][cStamPerLvl],
          lpv: +tsv.lines[i][cLifePerVit],
          spv: +tsv.lines[i][cStamPerVit],
          mpe: +tsv.lines[i][cManaPerMag]
        },
        a: {
          str: +tsv.lines[i][cStr],
          dex: +tsv.lines[i][cDex],
          int: +tsv.lines[i][cInt],
          vit: +tsv.lines[i][cVit],
          stam: +tsv.lines[i][cStam],
          hpadd: tsv.lines[i][cHpadd]
        }
      };
      id++;
    }
  }
  return arr;
}
function _readSkillDesc(tsv, strings) {
  const arr = {};
  const cSkillDesc = tsv.header.indexOf("skilldesc");
  const cStrName = tsv.header.indexOf("str name");
  for (let i = 1; i < tsv.lines.length; i++) {
    const id = tsv.lines[i][cSkillDesc];
    const skillStrName = tsv.lines[i][cStrName];
    if (id && skillStrName) {
      arr[id] = strings[skillStrName];
    }
  }
  return arr;
}
function _readSkills(tsv, skillDescs, _strings) {
  const arr = [];
  const cSkillDesc = tsv.header.indexOf("skilldesc");
  let cId = tsv.header.indexOf("Id");
  if (cId < 0) {
    cId = tsv.header.indexOf("*Id");
  }
  const cCharclass = tsv.header.indexOf("charclass");
  for (let i = 1; i < tsv.lines.length; i++) {
    const id = +tsv.lines[i][cId];
    const skillDesc = tsv.lines[i][cSkillDesc];
    if (skillDesc) {
      const o = {};
      if (skillDescs[skillDesc]) o.s = skillDescs[skillDesc];
      if (tsv.lines[i][cCharclass]) o.c = tsv.lines[i][cCharclass];
      arr[id] = o;
    }
  }
  return arr;
}
function _readRareNames(tsv, idx, strings) {
  const arr = [];
  const cName = tsv.header.indexOf("name");
  let id = idx;
  for (let i = 1; i < tsv.lines.length; i++) {
    const name = tsv.lines[i][cName];
    if (name) {
      arr[id - idx] = {
        n: strings[name]
      };
      id++;
    }
  }
  return arr;
}
function _readMagicNames(tsv, strings) {
  const arr = [];
  const cName = tsv.header.indexOf("Name");
  const cTransformcolor = tsv.header.indexOf("transformcolor");
  let id = 1;
  for (let i = 1; i < tsv.lines.length; i++) {
    const name = tsv.lines[i][cName];
    if (name != "Expansion") {
      const o = {};
      o.n = strings[name];
      if (tsv.lines[i][cTransformcolor]) o.tc = tsv.lines[i][cTransformcolor];
      arr[id] = o;
      id++;
    }
  }
  return arr;
}
function _readProperties(tsv, _strings) {
  const arr = {};
  const cCode = tsv.header.indexOf("code");
  const cStats = [];
  for (let j = 1; j <= 7; j++) {
    cStats[j] = {};
    cStats[j].cStat = tsv.header.indexOf(`stat${j}`);
    cStats[j].cFunc = tsv.header.indexOf(`func${j}`);
  }
  for (let i = 1; i < tsv.lines.length; i++) {
    const code = tsv.lines[i][cCode];
    if (code != "Expansion") {
      const prop = [];
      for (let j = 1; j <= 7; j++) {
        const stat = tsv.lines[i][cStats[j].cStat];
        const func = tsv.lines[i][cStats[j].cFunc];
        if (!stat && !func) {
          break;
        }
        const s = {};
        if (stat) s.s = stat;
        if (func) s.f = +func;
        prop[j - 1] = s;
      }
      if (prop.length) {
        arr[code] = prop;
      }
    }
  }
  return arr;
}
function _readRunewords(tsv, strings) {
  const arr = [];
  const cName = tsv.header.indexOf("Name");
  for (let i = 1; i < tsv.lines.length; i++) {
    const name = tsv.lines[i][cName];
    if (name) {
      let id = +name.substring(8);
      if (id > 75) {
        id += 25;
      } else {
        id += 26;
      }
      arr[id] = {
        n: strings[tsv.lines[i][cName]]
      };
    }
  }
  return arr;
}
function _readTypes(tsv, _strings) {
  const arr = {};
  const cCode = tsv.header.indexOf("Code");
  const cItemType = tsv.header.indexOf("ItemType");
  const cEquiv1 = tsv.header.indexOf("Equiv1");
  const cEquiv2 = tsv.header.indexOf("Equiv2");
  const cInvGfx = [];
  for (let i = 1; i <= 6; i++) {
    cInvGfx.push(tsv.header.indexOf(`InvGfx${i}`));
  }
  for (let i = 1; i < tsv.lines.length; i++) {
    const code = tsv.lines[i][cCode];
    if (code) {
      const o = {};
      const invgfx = [];
      for (let j = 0; j <= 6; j++) {
        if (tsv.lines[i][cInvGfx[j]]) invgfx[j] = tsv.lines[i][cInvGfx[j]];
      }
      o.ig = invgfx;
      o.eq1 = tsv.lines[i][cEquiv1];
      o.eq2 = tsv.lines[i][cEquiv2];
      o.n = tsv.lines[i][cItemType];
      o.c = [o.n];
      arr[code] = o;
    }
  }
  for (const k of Object.keys(arr)) {
    arr[k].c = [..._resolvetItemTypeCategories(arr, k)];
    if (arr[k] !== void 0 && arr[arr[k].eq1] !== void 0) {
      arr[k].eq1n = arr[arr[k].eq1].n;
    }
    if (arr[k] !== void 0 && arr[arr[k].eq2] !== void 0) {
      arr[k].eq2n = arr[arr[k].eq2].n;
    }
  }
  return arr;
}
function _resolvetItemTypeCategories(arr, key) {
  let res = [];
  if (arr[key] !== void 0) {
    res = [
      arr[key].n,
      ..._resolvetItemTypeCategories(arr, arr[key].eq1),
      ..._resolvetItemTypeCategories(arr, arr[key].eq2)
    ];
  }
  return res;
}
function _readItems(tsv, itemtypes, strings) {
  const arr = [];
  const cCode = tsv.header.indexOf("code");
  const cNameStr = tsv.header.indexOf("namestr");
  const cStackable = tsv.header.indexOf("stackable");
  const cMinac = tsv.header.indexOf("minac");
  const cMaxac = tsv.header.indexOf("maxac");
  const cDurability = tsv.header.indexOf("durability");
  const cMindam = tsv.header.indexOf("mindam");
  const cMaxdam = tsv.header.indexOf("maxdam");
  const cTwoHandMindam = tsv.header.indexOf("2handmindam");
  const cTwoHandMaxdam = tsv.header.indexOf("2handmaxdam");
  const cMinmisdam = tsv.header.indexOf("minmisdam");
  const cMaxmisdam = tsv.header.indexOf("maxmisdam");
  const cReqstr = tsv.header.indexOf("reqstr");
  const cReqdex = tsv.header.indexOf("reqdex");
  const cHasinv = tsv.header.indexOf("hasinv");
  const cGemapplytype = tsv.header.indexOf("gemapplytype");
  const cInvfile = tsv.header.indexOf("invfile");
  const cUniqueInvfile = tsv.header.indexOf("uniqueinvfile");
  const cSetInvfile = tsv.header.indexOf("setinvfile");
  const cInvwidth = tsv.header.indexOf("invwidth");
  const cInvheight = tsv.header.indexOf("invheight");
  const cInvtransform = tsv.header.indexOf("InvTrans");
  const cType = tsv.header.indexOf("type");
  const cNormCode = tsv.header.indexOf("normcode");
  const cUberCode = tsv.header.indexOf("ubercode");
  const cUltraCode = tsv.header.indexOf("ultracode");
  const cAdvancedStashStackable = tsv.header.indexOf("AdvancedStashStackable");
  for (let i = 1; i < tsv.lines.length; i++) {
    const code = tsv.lines[i][cCode];
    if (code) {
      const item = {};
      item.code = code;
      item.nc = tsv.lines[i][cNormCode];
      item.exc = tsv.lines[i][cUberCode];
      item.elc = tsv.lines[i][cUltraCode];
      item.iq = item.code === item.exc ? "exceptional" : item.code === item.elc ? "elite" : "normal";
      item.n = strings[tsv.lines[i][cNameStr]];
      if (tsv.lines[i][cStackable] && +tsv.lines[i][cStackable] > 0) item.s = 1;
      if (tsv.lines[i][cMinac] && +tsv.lines[i][cMinac] > 0)
        item.minac = +tsv.lines[i][cMinac];
      if (tsv.lines[i][cMaxac] && +tsv.lines[i][cMaxac] > 0)
        item.maxac = +tsv.lines[i][cMaxac];
      if (tsv.lines[i][cDurability])
        item.durability = +tsv.lines[i][cDurability];
      if (tsv.lines[i][cMindam] && +tsv.lines[i][cMindam] > 0)
        item.mind = +tsv.lines[i][cMindam];
      if (tsv.lines[i][cMaxdam] && +tsv.lines[i][cMaxdam] > 0)
        item.maxd = +tsv.lines[i][cMaxdam];
      if (tsv.lines[i][cTwoHandMindam] && +tsv.lines[i][cTwoHandMindam] > 0)
        item.min2d = +tsv.lines[i][cTwoHandMindam];
      if (tsv.lines[i][cTwoHandMaxdam] && +tsv.lines[i][cTwoHandMaxdam] > 0)
        item.max2d = +tsv.lines[i][cTwoHandMaxdam];
      if (tsv.lines[i][cMinmisdam] && +tsv.lines[i][cMinmisdam] > 0)
        item.minmd = +tsv.lines[i][cMinmisdam];
      if (tsv.lines[i][cMaxmisdam] && +tsv.lines[i][cMaxmisdam] > 0)
        item.maxmd = +tsv.lines[i][cMaxmisdam];
      if (tsv.lines[i][cReqstr]) item.rs = +tsv.lines[i][cReqstr];
      if (tsv.lines[i][cReqdex]) item.rd = +tsv.lines[i][cReqdex];
      if (tsv.lines[i][cHasinv]) item.hi = +tsv.lines[i][cHasinv];
      if (tsv.lines[i][cGemapplytype]) item.gt = +tsv.lines[i][cGemapplytype];
      if (tsv.lines[i][cInvfile]) item.i = tsv.lines[i][cInvfile];
      if (tsv.lines[i][cUniqueInvfile]) item.ui = tsv.lines[i][cUniqueInvfile];
      if (tsv.lines[i][cSetInvfile]) item.si = tsv.lines[i][cSetInvfile];
      if (tsv.lines[i][cInvwidth]) item.iw = +tsv.lines[i][cInvwidth];
      if (tsv.lines[i][cInvheight]) item.ih = +tsv.lines[i][cInvheight];
      if (tsv.lines[i][cInvtransform]) item.it = +tsv.lines[i][cInvtransform];
      const type = itemtypes[tsv.lines[i][cType]];
      if (type && type.ig) {
        item.ig = type.ig;
        item.eq1n = type.eq1n;
        item.eq2n = type.eq2n;
        item.c = type.c;
      }
      item.AdvancedStashStackable = tsv.lines[i][cAdvancedStashStackable];
      arr.push(item);
    }
  }
  return arr;
}
function _readGems(miscItems, tsv, _strings) {
  const cCode = tsv.header.indexOf("code");
  const types = ["weapon", "helm", "shield"];
  const cols = {};
  for (const type of types) {
    cols[type] = [];
    for (let j = 1; j <= 3; j++) {
      cols[type][j] = {};
      cols[type][j].cMod = tsv.header.indexOf(`${type}Mod${j}Code`);
      cols[type][j].cParam = tsv.header.indexOf(`${type}Mod${j}Param`);
      cols[type][j].cMin = tsv.header.indexOf(`${type}Mod${j}Min`);
      cols[type][j].cMax = tsv.header.indexOf(`${type}Mod${j}Max`);
    }
  }
  for (let i = 1; i < tsv.lines.length; i++) {
    const code = tsv.lines[i][cCode];
    if (code && code != "Expansion") {
      const item = miscItems[code];
      for (let k = 0; k < 3; k++) {
        const type = types[k];
        for (let j = 1; j <= 3; j++) {
          const mod = tsv.lines[i][cols[type][j].cMod];
          if (!mod) {
            break;
          }
          if (j == 1) {
            if (!item.m) item.m = [];
            item.m[k] = [];
          }
          const m = {};
          m.m = mod;
          if (tsv.lines[i][cols[type][j].cParam])
            m.p = +tsv.lines[i][cols[type][j].cParam];
          if (tsv.lines[i][cols[type][j].cMin])
            m.min = +tsv.lines[i][cols[type][j].cMin];
          if (tsv.lines[i][cols[type][j].cMax])
            m.max = +tsv.lines[i][cols[type][j].cMax];
          item.m[k].push(m);
        }
      }
    }
  }
}
function _readSetOrUnqItems(tsv, strings) {
  const arr = [];
  const cIndex = tsv.header.indexOf("index");
  const cInvfile = tsv.header.indexOf("invfile");
  let cCode = tsv.header.indexOf("code");
  if (cCode < 0) cCode = tsv.header.indexOf("item");
  const cInvtransform = tsv.header.indexOf("invtransform");
  let id = 0;
  for (let i = 1; i < tsv.lines.length; i++) {
    const index = tsv.lines[i][cIndex];
    if (index && index != "Expansion") {
      const o = {};
      o.n = strings[tsv.lines[i][cIndex]];
      if (tsv.lines[i][cInvfile]) o.i = tsv.lines[i][cInvfile];
      if (tsv.lines[i][cCode]) o.c = tsv.lines[i][cCode];
      if (tsv.lines[i][cInvtransform]) o.tc = tsv.lines[i][cInvtransform];
      arr[id] = o;
      id++;
    }
  }
  return arr;
}
var item_property_stat_count = {
  item_maxdamage_percent: {
    numprops: 2,
    rangestr: "strModMinDamageRange",
    equalstr: "strModEnhancedDamage"
  },
  firemindam: {
    numprops: 2,
    rangestr: "strModFireDamageRange",
    equalstr: "strModFireDamage"
  },
  lightmindam: {
    numprops: 2,
    rangestr: "strModLightningDamageRange",
    equalstr: "strModLightningDamage"
  },
  magicmindam: {
    numprops: 2,
    rangestr: "strModMagicDamageRange",
    equalstr: "strModMagicDamage"
  },
  coldmindam: {
    numprops: 3,
    rangestr: "strModColdDamageRange",
    equalstr: "strModColdDamage"
  },
  poisonmindam: {
    numprops: 3,
    rangestr: "strModPoisonDamageRange",
    equalstr: "strModPoisonDamage"
  }
};
function _readItemStatCosts(tsv, strings) {
  const arr = [];
  const cStat = tsv.header.indexOf("Stat");
  let cId = tsv.header.indexOf("ID");
  if (cId < 0) {
    cId = tsv.header.indexOf("*ID");
  }
  const cCSvBits = tsv.header.indexOf("CSvBits");
  const cCSvParam = tsv.header.indexOf("CSvParam");
  const cCSvSigned = tsv.header.indexOf("CSvSigned");
  const cEncode = tsv.header.indexOf("Encode");
  const cValShift = tsv.header.indexOf("ValShift");
  const cSigned = tsv.header.indexOf("Signed");
  const cSaveBits = tsv.header.indexOf("Save Bits");
  const cSaveAdd = tsv.header.indexOf("Save Add");
  const cSaveParamBits = tsv.header.indexOf("Save Param Bits");
  const cDescPriority = tsv.header.indexOf("descpriority");
  const cDescFunc = tsv.header.indexOf("descfunc");
  const cDescVal = tsv.header.indexOf("descval");
  const cDescstrpos = tsv.header.indexOf("descstrpos");
  const cDescstrneg = tsv.header.indexOf("descstrneg");
  const cDescstr2 = tsv.header.indexOf("descstr2");
  const cDgrp = tsv.header.indexOf("dgrp");
  const cDgrpFunc = tsv.header.indexOf("dgrpfunc");
  const cDgrpVal = tsv.header.indexOf("dgrpval");
  const cDgrpstrpos = tsv.header.indexOf("dgrpstrpos");
  const cDgrpstrneg = tsv.header.indexOf("dgrpstrneg");
  const cDgrpstr2 = tsv.header.indexOf("dgrpstr2");
  const cOp = tsv.header.indexOf("op");
  const cOpParam = tsv.header.indexOf("op param");
  const cOpBase = tsv.header.indexOf("op base");
  const cOpStat1 = tsv.header.indexOf("op stat1");
  const cOpStat2 = tsv.header.indexOf("op stat2");
  const cOpStat3 = tsv.header.indexOf("op stat3");
  for (let i = 1; i < tsv.lines.length; i++) {
    const id = +tsv.lines[i][cId];
    const stat = tsv.lines[i][cStat];
    if (stat) {
      const o = {};
      o.s = stat;
      if (tsv.lines[i][cCSvBits]) o.cB = +tsv.lines[i][cCSvBits];
      if (tsv.lines[i][cCSvParam]) o.cP = +tsv.lines[i][cCSvParam];
      if (tsv.lines[i][cCSvSigned]) o.cS = +tsv.lines[i][cCSvSigned];
      if (tsv.lines[i][cEncode]) o.e = +tsv.lines[i][cEncode];
      if (tsv.lines[i][cValShift]) o.vS = +tsv.lines[i][cValShift];
      if (tsv.lines[i][cSigned]) o.sS = +tsv.lines[i][cSigned];
      if (tsv.lines[i][cSaveBits]) o.sB = +tsv.lines[i][cSaveBits];
      if (tsv.lines[i][cSaveAdd]) o.sA = +tsv.lines[i][cSaveAdd];
      if (tsv.lines[i][cSaveParamBits]) o.sP = +tsv.lines[i][cSaveParamBits];
      if (tsv.lines[i][cDescPriority]) o.so = +tsv.lines[i][cDescPriority];
      if (tsv.lines[i][cDescFunc]) o.dF = +tsv.lines[i][cDescFunc];
      if (tsv.lines[i][cDescVal]) o.dV = +tsv.lines[i][cDescVal];
      if (tsv.lines[i][cDescstrpos]) o.dP = strings[tsv.lines[i][cDescstrpos]];
      if (tsv.lines[i][cDescstrneg]) o.dN = strings[tsv.lines[i][cDescstrneg]];
      if (tsv.lines[i][cDescstr2]) o.d2 = strings[tsv.lines[i][cDescstr2]];
      if (tsv.lines[i][cDgrp]) o.dg = +tsv.lines[i][cDgrp];
      if (tsv.lines[i][cDgrpFunc]) o.dgF = +tsv.lines[i][cDgrpFunc];
      if (tsv.lines[i][cDgrpVal]) o.dgV = +tsv.lines[i][cDgrpVal];
      if (tsv.lines[i][cDgrpstrpos]) o.dgP = strings[tsv.lines[i][cDgrpstrpos]];
      if (tsv.lines[i][cDgrpstrneg]) o.dN = strings[tsv.lines[i][cDgrpstrneg]];
      if (tsv.lines[i][cDgrpstr2]) o.dg2 = strings[tsv.lines[i][cDgrpstr2]];
      if (tsv.lines[i][cOp]) o.o = +tsv.lines[i][cOp];
      if (tsv.lines[i][cOpParam]) o.op = +tsv.lines[i][cOpParam];
      if (tsv.lines[i][cOpBase]) o.ob = tsv.lines[i][cOpBase];
      if (tsv.lines[i][cOpStat1]) o.os = [tsv.lines[i][cOpStat1]];
      if (tsv.lines[i][cOpStat2]) o.os[1] = tsv.lines[i][cOpStat2];
      if (tsv.lines[i][cOpStat3]) o.os[2] = tsv.lines[i][cOpStat3];
      const dmgstatrange = item_property_stat_count[stat];
      if (dmgstatrange) {
        o.np = dmgstatrange.numprops;
        o.dR = strings[dmgstatrange.rangestr];
        o.dE = strings[dmgstatrange.equalstr];
      }
      arr[id] = o;
    }
  }
  return arr;
}
export {
  fixHeader,
  getConstantData,
  read,
  readAttributes,
  readConstantData,
  readHeader2 as readHeader,
  readHeaderData,
  readItem2 as readItem,
  readSkills,
  reader,
  setConstantData,
  stash_exports as stash,
  write,
  writeAttributes,
  writeHeader2 as writeHeader,
  writeHeaderData,
  writeItem2 as writeItem,
  writeSkills,
  writer
};
