/*
 * DCL Seed Map native worker.
 * Original wrapper code: MIT. World generation is provided by Cubiomes (MIT),
 * revision e61f90580cbdd883214a8054670dacae655e59c0.
 */
#include <errno.h>
#include <inttypes.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

#include "../../vendor/cubiomes/generator.h"
#include "../../vendor/cubiomes/finders.h"

typedef struct {
    const char *key;
    int type;
    int dim;
    int predicted;
} DclStructure;

static const DclStructure STRUCTURES[] = {
    {"village", Village, DIM_OVERWORLD, 0},
    {"outpost", Outpost, DIM_OVERWORLD, 0},
    {"desert_pyramid", Desert_Pyramid, DIM_OVERWORLD, 1},
    {"jungle_pyramid", Jungle_Pyramid, DIM_OVERWORLD, 1},
    {"monument", Monument, DIM_OVERWORLD, 0},
    {"mansion", Mansion, DIM_OVERWORLD, 1},
    {"ancient_city", Ancient_City, DIM_OVERWORLD, 0},
    {"trial_chambers", Trial_Chambers, DIM_OVERWORLD, 0},
    {"ruined_portal", Ruined_Portal, DIM_OVERWORLD, 0},
    {"fortress", Fortress, DIM_NETHER, 0},
    {"bastion", Bastion, DIM_NETHER, 0},
    {"ruined_portal_nether", Ruined_Portal_N, DIM_NETHER, 0},
    {"end_city", End_City, DIM_END, 1},
};

static void fail(const char *message) {
    fprintf(stderr, "%s\n", message);
    exit(2);
}

static int parse_version(const char *value) {
    if (!strcmp(value, "1.16") || !strcmp(value, "1.16.1")) return MC_1_16_1;
    if (!strcmp(value, "1.16.2") || !strcmp(value, "1.16.3") || !strcmp(value, "1.16.4") || !strcmp(value, "1.16.5")) return MC_1_16_5;
    if (!strcmp(value, "1.17") || !strcmp(value, "1.17.1")) return MC_1_17_1;
    if (!strcmp(value, "1.18") || !strcmp(value, "1.18.1") || !strcmp(value, "1.18.2")) return MC_1_18_2;
    if (!strcmp(value, "1.19") || !strcmp(value, "1.19.1") || !strcmp(value, "1.19.2")) return MC_1_19_2;
    if (!strcmp(value, "1.19.3") || !strcmp(value, "1.19.4")) return MC_1_19_4;
    if (!strcmp(value, "1.20") || !strcmp(value, "1.20.1") || !strcmp(value, "1.20.2") || !strcmp(value, "1.20.3") || !strcmp(value, "1.20.4") || !strcmp(value, "1.20.5") || !strcmp(value, "1.20.6")) return MC_1_20_6;
    if (!strcmp(value, "1.21") || !strcmp(value, "1.21.1")) return MC_1_21_1;
    if (!strcmp(value, "1.21.2") || !strcmp(value, "1.21.3")) return MC_1_21_3;
    if (!strcmp(value, "1.21.4")) return MC_1_21_WD;
    fail("unsupported Minecraft version");
    return MC_UNDEF;
}

static int parse_dimension(const char *value) {
    if (!strcmp(value, "overworld")) return DIM_OVERWORLD;
    if (!strcmp(value, "nether")) return DIM_NETHER;
    if (!strcmp(value, "end")) return DIM_END;
    fail("unsupported dimension");
    return DIM_UNDEF;
}

static int parse_int(const char *value, int min, int max, const char *error) {
    char *end = NULL;
    errno = 0;
    long parsed = strtol(value, &end, 10);
    if (errno || !end || *end || parsed < min || parsed > max) fail(error);
    return (int)parsed;
}

static uint64_t parse_seed(const char *value) {
    char *end = NULL;
    errno = 0;
    int64_t parsed = strtoll(value, &end, 10);
    if (errno || !end || *end) fail("seed must be a signed 64-bit decimal integer");
    return (uint64_t)parsed;
}

static int floor_div(int value, int divisor) {
    int quotient = value / divisor;
    int remainder = value % divisor;
    return remainder < 0 ? quotient - 1 : quotient;
}

/* Independent DCL palette; no Cubiomes Viewer/AMIDST color assets are used. */
static void biome_color(int id, unsigned char out[4]) {
    unsigned char r = 116, g = 139, b = 112;
    switch (id) {
    case ocean: case deep_ocean: r=35; g=82; b=155; break;
    case warm_ocean: case deep_warm_ocean: r=40; g=142; b=180; break;
    case lukewarm_ocean: case deep_lukewarm_ocean: r=42; g=112; b=174; break;
    case cold_ocean: case deep_cold_ocean: r=54; g=78; b=142; break;
    case frozen_ocean: case deep_frozen_ocean: r=118; g=168; b=206; break;
    case river: case frozen_river: r=58; g=126; b=205; break;
    case plains: case sunflower_plains: case meadow: r=126; g=180; b=83; break;
    case forest: case flower_forest: case birch_forest: case tall_birch_forest:
        r=47; g=126; b=63; break;
    case dark_forest: case dark_forest_hills: case pale_garden: r=52; g=87; b=62; break;
    case taiga: case snowy_taiga: case giant_tree_taiga: case giant_spruce_taiga:
        r=45; g=108; b=91; break;
    case desert: case desert_hills: case desert_lakes: r=226; g=190; b=87; break;
    case jungle: case jungle_hills: case jungle_edge: case bamboo_jungle:
        r=40; g=142; b=55; break;
    case swamp: case mangrove_swamp: r=73; g=116; b=83; break;
    case snowy_tundra: case snowy_mountains: case snowy_slopes: case grove:
        r=224; g=237; b=239; break;
    case mountains: case wooded_mountains: case gravelly_mountains: case jagged_peaks:
    case frozen_peaks: case stony_peaks: r=132; g=137; b=136; break;
    case savanna: case savanna_plateau: case shattered_savanna: r=178; g=181; b=91; break;
    case badlands: case wooded_badlands_plateau: case badlands_plateau: case eroded_badlands:
        r=183; g=95; b=56; break;
    case mushroom_fields: case mushroom_field_shore: r=155; g=86; b=161; break;
    case beach: case snowy_beach: r=224; g=211; b=145; break;
    case stone_shore: r=130; g=132; b=130; break;
    case dripstone_caves: r=111; g=91; b=72; break;
    case lush_caves: r=69; g=139; b=68; break;
    case deep_dark: r=24; g=55; b=67; break;
    case nether_wastes: r=117; g=50; b=47; break;
    case soul_sand_valley: r=92; g=72; b=64; break;
    case crimson_forest: r=145; g=41; b=57; break;
    case warped_forest: r=37; g=134; b=128; break;
    case basalt_deltas: r=71; g=68; b=73; break;
    case the_end: r=211; g=216; b=145; break;
    case small_end_islands: r=176; g=181; b=120; break;
    case end_midlands: r=194; g=199; b=131; break;
    case end_highlands: r=225; g=229; b=153; break;
    case end_barrens: r=138; g=143; b=101; break;
    default: break;
    }
    out[0]=r; out[1]=g; out[2]=b; out[3]=255;
}

static int requested(const char *csv, const char *key) {
    size_t keylen = strlen(key);
    const char *cursor = csv;
    while (*cursor) {
        const char *comma = strchr(cursor, ',');
        size_t len = comma ? (size_t)(comma - cursor) : strlen(cursor);
        if (len == keylen && !strncmp(cursor, key, len)) return 1;
        if (!comma) break;
        cursor = comma + 1;
    }
    return 0;
}

static int command_biomes(int argc, char **argv) {
    if (argc != 11) fail("usage: biomes <version> <seed> <dimension> <x> <z> <width> <height> <scale> <y>");
    int mc = parse_version(argv[2]);
    uint64_t seed = parse_seed(argv[3]);
    int dim = parse_dimension(argv[4]);
    int x = parse_int(argv[5], -30000000, 30000000, "x out of range");
    int z = parse_int(argv[6], -30000000, 30000000, "z out of range");
    int width = parse_int(argv[7], 1, 256, "width out of range");
    int height = parse_int(argv[8], 1, 256, "height out of range");
    int scale = parse_int(argv[9], 1, 64, "scale out of range");
    int y = parse_int(argv[10], -64, 320, "y out of range");
    if (!(scale == 4 || scale == 8 || scale == 16 || scale == 32 || scale == 64)) fail("unsupported map scale");

    Generator generator;
    setupGenerator(&generator, mc, 0);
    applySeed(&generator, dim, seed);
    Range range = {scale, floor_div(x, scale), floor_div(z, scale), width, height, floor_div(y, scale), 1};
    int *ids = allocCache(&generator, range);
    if (!ids) fail("unable to allocate biome cache");
    if (genBiomes(&generator, ids, range) != 0) { free(ids); fail("biome generation failed"); }
    unsigned char *pixels = (unsigned char*)malloc((size_t)width * height * 4);
    if (!pixels) { free(ids); fail("unable to allocate pixel buffer"); }
    for (int i = 0; i < width * height; i++) biome_color(ids[i], pixels + i * 4);
#ifdef _WIN32
    _setmode(_fileno(stdout), _O_BINARY);
#endif
    size_t expected = (size_t)width * height * 4;
    if (fwrite(pixels, 1, expected, stdout) != expected) { free(pixels); free(ids); fail("unable to write biome tile"); }
    free(pixels);
    free(ids);
    return 0;
}

static void print_item(int *first, const char *key, int x, int z, int predicted) {
    if (!*first) putchar(',');
    *first = 0;
    printf("{\"type\":\"%s\",\"x\":%d,\"z\":%d,\"predicted\":%s}", key, x, z, predicted ? "true" : "false");
}

static int command_structures(int argc, char **argv) {
    if (argc != 11) fail("usage: structures <version> <seed> <dimension> <minX> <minZ> <maxX> <maxZ> <types>");
    int mc = parse_version(argv[2]);
    uint64_t seed = parse_seed(argv[3]);
    int dim = parse_dimension(argv[4]);
    int minX = parse_int(argv[5], -30000000, 30000000, "minX out of range");
    int minZ = parse_int(argv[6], -30000000, 30000000, "minZ out of range");
    int maxX = parse_int(argv[7], -30000000, 30000000, "maxX out of range");
    int maxZ = parse_int(argv[8], -30000000, 30000000, "maxZ out of range");
    const char *types = argv[9];
    int limit = parse_int(argv[10], 1, 5000, "result limit out of range");
    if (minX > maxX || minZ > maxZ || (int64_t)maxX-minX > 160000 || (int64_t)maxZ-minZ > 160000) fail("structure query area is too large");

    Generator generator;
    setupGenerator(&generator, mc, 0);
    applySeed(&generator, dim, seed);
    int first = 1, count = 0, truncated = 0;
    printf("{\"items\":[");

    if (dim == DIM_OVERWORLD && requested(types, "stronghold")) {
        StrongholdIter iterator;
        initFirstStronghold(&iterator, mc, seed);
        for (int i = 0; i < 128; i++) {
            nextStronghold(&iterator, &generator);
            if (iterator.pos.x >= minX && iterator.pos.x <= maxX && iterator.pos.z >= minZ && iterator.pos.z <= maxZ) {
                if (count >= limit) { truncated = 1; break; }
                print_item(&first, "stronghold", iterator.pos.x, iterator.pos.z, 0);
                count++;
            }
        }
    }

    size_t structureCount = sizeof(STRUCTURES) / sizeof(STRUCTURES[0]);
    for (size_t s = 0; s < structureCount && !truncated; s++) {
        const DclStructure *entry = &STRUCTURES[s];
        if (entry->dim != dim || !requested(types, entry->key)) continue;
        StructureConfig config;
        if (!getStructureConfig(entry->type, mc, &config)) continue;
        int span = config.regionSize << 4;
        int rx0 = floor_div(minX, span), rx1 = floor_div(maxX, span);
        int rz0 = floor_div(minZ, span), rz1 = floor_div(maxZ, span);
        for (int rz = rz0; rz <= rz1 && !truncated; rz++) {
            for (int rx = rx0; rx <= rx1; rx++) {
                Pos pos;
                if (!getStructurePos(entry->type, mc, seed, rx, rz, &pos)) continue;
                if (pos.x < minX || pos.x > maxX || pos.z < minZ || pos.z > maxZ) continue;
                if (!isViableStructurePos(entry->type, &generator, pos.x, pos.z, 0)) continue;
                if (mc >= MC_1_18 && !isViableStructureTerrain(entry->type, &generator, pos.x, pos.z)) continue;
                if (count >= limit) { truncated = 1; break; }
                print_item(&first, entry->key, pos.x, pos.z, entry->predicted);
                count++;
            }
        }
    }
    printf("],\"truncated\":%s}\n", truncated ? "true" : "false");
    return 0;
}

int main(int argc, char **argv) {
    if (argc < 2) fail("missing command");
    if (!strcmp(argv[1], "biomes")) return command_biomes(argc, argv);
    if (!strcmp(argv[1], "structures")) return command_structures(argc, argv);
    fail("unknown command");
    return 2;
}
