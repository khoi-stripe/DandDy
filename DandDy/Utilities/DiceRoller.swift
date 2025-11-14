import Foundation

class DiceRoller {
    static func roll(sides: Int, count: Int = 1, modifier: Int = 0) -> Int {
        var total = modifier
        for _ in 0..<count {
            total += Int.random(in: 1...sides)
        }
        return total
    }
    
    static func rollD20() -> Int {
        return roll(sides: 20)
    }
    
    static func rollD20(advantage: Bool = false, disadvantage: Bool = false) -> Int {
        if advantage {
            return max(rollD20(), rollD20())
        } else if disadvantage {
            return min(rollD20(), rollD20())
        }
        return rollD20()
    }
    
    static func rollAbilityScore() -> Int {
        // Roll 4d6, drop lowest
        let rolls = (0..<4).map { _ in Int.random(in: 1...6) }
        let sorted = rolls.sorted()
        return sorted.dropFirst().reduce(0, +)
    }
    
    static func calculateModifier(_ score: Int) -> Int {
        return (score - 10) / 2
    }
}


