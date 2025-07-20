<script setup>
</script>

<template>
  <div class="home">
    <h1>Home</h1>
    <p>Welcome to Relics Of Sanctuary</p>
    <div class="features">
      <div class="feature">
        <h3>Unique Items</h3>
        <p>Browse our extensive collection of unique items with detailed stats and properties.</p>
      </div>
<!--      <div class="feature">-->
<!--        <h3>Horadric Cube</h3>-->
<!--        <p>Discover powerful cube recipes to craft and transform items.</p>-->
<!--      </div>-->
    </div>
  </div>
</template>

<style scoped>
.home {
  padding: 1rem;
}

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin-top: 2rem;
}

.feature {
  background-color: #f5f5f5;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

h1 {
  margin-bottom: 1rem;
}

h3 {
  margin-top: 0;
  color: #2c3e50;
}
</style>