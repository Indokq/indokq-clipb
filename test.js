// ============================================
// Test JavaScript Script - Beginner Friendly
// ============================================
// This script demonstrates basic JavaScript concepts
// Run this file using: node test.js

// 1) Simple Hello World Console Log
// ---------------------------------
// The console.log() function prints messages to the terminal
console.log("Hello, World!");
console.log("Welcome to JavaScript testing!");

// Add a blank line for better readability
console.log("");

// 2) Basic Function with Test Call
// ---------------------------------
// Functions are reusable blocks of code that perform specific tasks

/**
 * Adds two numbers together and returns the result
 * @param {number} a - The first number
 * @param {number} b - The second number
 * @returns {number} The sum of a and b
 */
function addNumbers(a, b) {
    return a + b;
}

/**
 * Greets a person by name
 * @param {string} name - The person's name
 * @returns {string} A personalized greeting message
 */
function greetPerson(name) {
    return `Hello, ${name}! Nice to meet you.`;
}

/**
 * Checks if a number is even or odd
 * @param {number} num - The number to check
 * @returns {string} A message indicating if the number is even or odd
 */
function checkEvenOrOdd(num) {
    if (num % 2 === 0) {
        return `${num} is an even number`;
    } else {
        return `${num} is an odd number`;
    }
}

// 3) Testing the Functions
// ---------------------------------
// Let's call our functions and display the results

console.log("Testing addNumbers() function:");
const sum1 = addNumbers(5, 3);
console.log(`  5 + 3 = ${sum1}`);

const sum2 = addNumbers(10, 25);
console.log(`  10 + 25 = ${sum2}`);

console.log("");

console.log("Testing greetPerson() function:");
const greeting1 = greetPerson("Alice");
console.log(`  ${greeting1}`);

const greeting2 = greetPerson("Bob");
console.log(`  ${greeting2}`);

console.log("");

console.log("Testing checkEvenOrOdd() function:");
console.log(`  ${checkEvenOrOdd(7)}`);
console.log(`  ${checkEvenOrOdd(12)}`);
console.log(`  ${checkEvenOrOdd(100)}`);

console.log("");

// 4) Bonus: Working with Arrays
// ---------------------------------
// Arrays are lists that can hold multiple values

console.log("Bonus: Working with arrays:");
const fruits = ["apple", "banana", "orange", "mango"];
console.log(`  My fruit list: ${fruits.join(", ")}`);
console.log(`  Number of fruits: ${fruits.length}`);
console.log(`  First fruit: ${fruits[0]}`);

console.log("");
console.log("✅ All tests completed successfully!");
