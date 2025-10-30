"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import teamsData from "@/data/teams.json"
import { Trophy, Shuffle, RotateCcw, Hand, Zap, ChevronLeft, ChevronRight, Download } from "lucide-react"

type BaseTeam = {
  name: string
  code: string
  flag: string // Keep flag for backwards compatibility
  logo?: string // URL to the team's logo image
  confederation: string
}

type Team = BaseTeam & { potIndex?: number }

type Pot = {
  name: string
  teams: BaseTeam[]
}

type TeamWithPotIndex = BaseTeam & { potIndex: number }

// Team with a guaranteed potIndex (useful for placements and algorithms)
type TeamWithPot = Team & { potIndex: number }

// Reusable entry shape for arrays passed to placement algorithms
type TeamEntry = { team: TeamWithPot; potIndex: number }

type Group = {
  name: string
  teams: TeamWithPotIndex[]
}

type DrawMode = "automatic" | "manual" | "instant"

export default function DrawSimulator() {
  const [groups, setGroups] = useState<Group[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentDrawingTeam, setCurrentDrawingTeam] = useState<Team | null>(null)
  const [availablePots, setAvailablePots] = useState<Pot[]>(teamsData.pots)
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<{ team: Team; potIndex: number } | null>(null)
  const [movingFromGroup, setMovingFromGroup] = useState<number | null>(null)
  const [currentPotIndex, setCurrentPotIndex] = useState(0)
  const cancelDrawRef = useRef(false)
  const teamClickedRef = useRef(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const groupsRef = useRef<HTMLDivElement>(null)
  const imageGroupsRef = useRef<HTMLDivElement>(null)

  const initializeGroups = (): Group[] => {
    return Array.from({ length: 12 }, (_, i) => ({
      name: String.fromCharCode(65 + i), // A, B, C, etc.
      teams: [] as TeamWithPotIndex[],
    }))
  }

  const shuffleArray = <T,>(array: T[]): T[] => {
    const newArray = [...array]
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[newArray[i], newArray[j]] = [newArray[j], newArray[i]]
    }
    return newArray
  }

  const countUEFATeamsInGroup = (group: Group): number => {
    return group.teams.filter((team) => team.confederation === "UEFA").length
  }

  const countGroupsWith2UEFATeams = (groupsArray: Group[]): number => {
    return groupsArray.filter((group) => countUEFATeamsInGroup(group) === 2).length
  }

  const canPlaceTeamInGroup = (
    team: Team,
    groupIndex: number,
    potIndex: number,
    groupsArray: Group[],
    excludeFromGroupIndex: number | null = null,
  ): boolean => {
    const group = groupsArray[groupIndex]

    // Rule 1: Mexico must be in Group A position 1
    if (team.code === "MEX" && groupIndex !== 0) {
      return false
    }
    if (groupIndex === 0 && group.teams.length === 0 && team.code !== "MEX") {
      return false
    }

    // Rule 2: Canada must be in Group B position 1
    if (team.code === "CAN" && groupIndex !== 1) {
      return false
    }
    if (groupIndex === 1 && group.teams.length === 0 && team.code !== "CAN") {
      return false
    }

    // Rule 3: USA must be in Group D position 1
    if (team.code === "USA" && groupIndex !== 3) {
      return false
    }
    if (groupIndex === 3 && group.teams.length === 0 && team.code !== "USA") {
      return false
    }
    
    // Check each team in the group for pot conflicts
    for (const teamInGroup of group.teams) {
      // Skip the team being moved if it's in this group
      if (excludeFromGroupIndex === groupIndex && teamInGroup.code === team.code) {
        continue
      }

      // Check if the team in the group came from the same pot as the team we're trying to place
      if (teamInGroup.potIndex === potIndex) {
        return false
      }
    }

    // Rule 3: Check if group is full (excluding the team being moved if it's in this group)
    const effectiveTeamCount = excludeFromGroupIndex === groupIndex ? group.teams.length - 1 : group.teams.length
    if (effectiveTeamCount >= 4) {
      return false
    }

    // Rule 4: Confederation restrictions
    if (team.confederation === "UEFA") {
      // Create a temporary groups array for UEFA counting (excluding the team being moved)
      const tempGroups = groupsArray.map((g, idx) => ({
        ...g,
        teams: excludeFromGroupIndex === idx ? g.teams.filter((t) => t.code !== team.code) : g.teams,
      }))

      const uefaTeamsInGroup = countUEFATeamsInGroup(tempGroups[groupIndex])
      const groupsWith2UEFA = countGroupsWith2UEFATeams(tempGroups)

      // UEFA can have max 2 teams per group, and only 4 groups can have 2 UEFA teams
      if (uefaTeamsInGroup >= 2) {
        return false
      }
      if (uefaTeamsInGroup === 1 && groupsWith2UEFA >= 4) {
        return false
      }
    } else {
      // Non-UEFA teams: cannot be in same group with team from same confederation (excluding the team being moved)
      const hasTeamFromSameConfederation = group.teams.some(
        (t) =>
          t.confederation === team.confederation && !(excludeFromGroupIndex === groupIndex && t.code === team.code),
      )
      if (hasTeamFromSameConfederation) {
        return false
      }
    }

    return true
  }

  const startDraw = (mode: DrawMode) => {
    setIsTransitioning(true)

    setTimeout(() => {
      cancelDrawRef.current = false
      setDrawMode(mode)
      const newGroups = initializeGroups()
      setGroups(newGroups)
      setCurrentPotIndex(0)
      setAvailablePots(teamsData.pots)

      if (mode === "automatic") {
        performAutomaticDraw()
      } else if (mode === "instant") {
        performInstantDraw()
      } else if (mode === "manual") {
        setIsDrawing(true)
      }

      setIsTransitioning(false)
    }, 300)
  }

  const placeTeamsWithBacktracking = (
    groupsArray: Group[],
    allTeams: TeamEntry[],
    teamIndex = 0,
    maxAttempts = 1000
  ): Group[] | null => {
    // Add attempt limit to prevent infinite loops
    if (maxAttempts <= 0) {
      return null;
    }

    // Base case: all teams placed successfully
    if (teamIndex >= allTeams.length) {
      // Validate that all groups have exactly 4 teams
      if (groupsArray.some(group => group.teams.length !== 4)) {
        return null;
      }
      // Validate that we placed all 48 teams
      const totalTeams = groupsArray.reduce((sum, group) => sum + group.teams.length, 0);
      if (totalTeams !== 48) {
        return null;
      }
      return groupsArray;
    }

    const { team, potIndex } = allTeams[teamIndex]

    // Special handling for USA, Canada, and Mexico
    if (team.code === "MEX" && !groupsArray[0].teams.some(t => t.code === "MEX")) {
      if (canPlaceTeamInGroup(team, 0, potIndex, groupsArray)) {
        const newGroups = groupsArray.map((g, i) =>
          i === 0 ? { ...g, teams: [...g.teams, { ...team, potIndex }] } : { ...g }
        );
        const result = placeTeamsWithBacktracking(newGroups, allTeams, teamIndex + 1, maxAttempts - 1);
        if (result) return result;
      }
      return null;
    }

    if (team.code === "CAN" && !groupsArray[1].teams.some(t => t.code === "CAN")) {
      if (canPlaceTeamInGroup(team, 1, potIndex, groupsArray)) {
        const newGroups = groupsArray.map((g, i) =>
          i === 1 ? { ...g, teams: [...g.teams, { ...team, potIndex }] } : { ...g }
        );
        const result = placeTeamsWithBacktracking(newGroups, allTeams, teamIndex + 1, maxAttempts - 1);
        if (result) return result;
      }
      return null;
    }

    if (team.code === "USA" && !groupsArray[3].teams.some(t => t.code === "USA")) {
      if (canPlaceTeamInGroup(team, 3, potIndex, groupsArray)) {
        const newGroups = groupsArray.map((g, i) =>
          i === 3 ? { ...g, teams: [...g.teams, { ...team, potIndex }] } : { ...g }
        );
        const result = placeTeamsWithBacktracking(newGroups, allTeams, teamIndex + 1, maxAttempts - 1);
        if (result) return result;
      }
      return null;
    }

    // For other teams, try each available group
    const availableGroups = Array.from({ length: 12 }, (_, i) => i)
      .filter(i => groupsArray[i].teams.length < 4);

    // Shuffle available groups for better distribution
    const shuffledGroups = shuffleArray(availableGroups);

    for (const groupIndex of shuffledGroups) {
      if (canPlaceTeamInGroup(team, groupIndex, potIndex, groupsArray)) {
        const newGroups = groupsArray.map((g, i) =>
          i === groupIndex ? { ...g, teams: [...g.teams, team as TeamWithPotIndex] } : { ...g }
        );

        const result = placeTeamsWithBacktracking(newGroups, allTeams, teamIndex + 1, maxAttempts - 1);
        if (result) return result;
      }
    }

    return null
  }

  const performAutomaticDraw = async () => {
    setIsDrawing(true)
    const newGroups = initializeGroups()

  // Prepare all teams with their pot indices
  const allTeams: TeamEntry[] = []

    // Mexico must be first (Group A position 1)
    const mexicoTeam = teamsData.pots[0].teams.find((t) => t.code === "MEX")
    if (mexicoTeam) {
      const withPotIndex = { ...mexicoTeam, potIndex: 0 } as TeamWithPotIndex
      allTeams.push({ team: withPotIndex, potIndex: 0 })
    }

    // Add all other teams
    for (let potIndex = 0; potIndex < teamsData.pots.length; potIndex++) {
      const pot = teamsData.pots[potIndex]
      let teamsToAdd = [...pot.teams]

      // Skip Mexico in Pot 1 as it's already added
      if (potIndex === 0) {
        teamsToAdd = teamsToAdd.filter((t) => t.code !== "MEX")
      }

      // Shuffle teams within each pot for randomness
      const shuffledTeams = shuffleArray(teamsToAdd)
      shuffledTeams.forEach((team) => {
        allTeams.push({ team: { ...team, potIndex }, potIndex }) // Store potIndex in team
      })
    }

    // Use backtracking to place all teams
    const result = placeTeamsWithBacktracking(newGroups, allTeams)

    if (!result) {
      console.error("[v0] Failed to place all teams - this should not happen!")
      setIsDrawing(false)
      return
    }

    // Animate the placement
    for (let i = 0; i < allTeams.length; i++) {
      if (cancelDrawRef.current) {
        setCurrentDrawingTeam(null)
        setIsDrawing(false)
        return
      }

      setCurrentDrawingTeam(allTeams[i].team)
      await new Promise((resolve) => setTimeout(resolve, 400))

      if (cancelDrawRef.current) {
        setCurrentDrawingTeam(null)
        setIsDrawing(false)
        return
      }

      // Update groups progressively to show animation
      const progressGroups = initializeGroups()
      for (let j = 0; j <= i; j++) {
        const { team } = allTeams[j]
        const groupIndex = result.findIndex((g) => g.teams.some((t) => t.code === team.code))
        if (groupIndex !== -1) {
          progressGroups[groupIndex].teams.push(team as TeamWithPotIndex)
        }
      }
      setGroups([...progressGroups])
    }

    setCurrentDrawingTeam(null)
    setIsDrawing(false)
    setAvailablePots([])
  }

  const performInstantDraw = () => {
    setIsDrawing(true)
    const newGroups = initializeGroups()

  // Prepare all teams with their pot indices
  const allTeams: TeamEntry[] = []

    // Mexico must be first (Group A position 1)
    const mexicoTeam = teamsData.pots[0].teams.find((t) => t.code === "MEX")
    if (mexicoTeam) {
      allTeams.push({ team: { ...mexicoTeam, potIndex: 0 }, potIndex: 0 }) // Store potIndex in team
    }

    // Add all other teams
    for (let potIndex = 0; potIndex < teamsData.pots.length; potIndex++) {
      const pot = teamsData.pots[potIndex]
      let teamsToAdd = [...pot.teams]

      // Skip Mexico in Pot 1 as it's already added
      if (potIndex === 0) {
        teamsToAdd = teamsToAdd.filter((t) => t.code !== "MEX")
      }

      // Shuffle teams within each pot for randomness
      const shuffledTeams = shuffleArray(teamsToAdd)
      shuffledTeams.forEach((team) => {
        allTeams.push({ team: { ...team, potIndex }, potIndex }) // Store potIndex in team
      })
    }

    // Use backtracking to place all teams
    const result = placeTeamsWithBacktracking(newGroups, allTeams)

    if (!result) {
      console.error("[v0] Failed to place all teams - this should not happen!")
      setIsDrawing(false)
      return
    }

    setGroups(result)
    setIsDrawing(false)
    setAvailablePots([])
  }

  const handleTeamSelect = (team: Team, potIndex: number) => {
    setSelectedTeam({ team, potIndex })
    setMovingFromGroup(null)
  }

  const handlePlacedTeamClick = (team: Team, groupIndex: number, e: React.MouseEvent) => {
    e.stopPropagation()
    teamClickedRef.current = true

    setTimeout(() => {
      teamClickedRef.current = false
    }, 100)

    if (!isManualMode) {
      return
    }

    // Use the stored potIndex from the team object
    if (team.potIndex === undefined) {
      console.error("[v0] Team does not have potIndex stored:", team)
      return
    }

    setSelectedTeam({ team, potIndex: team.potIndex })
    setMovingFromGroup(groupIndex)
  }

  const handleGroupSelect = (groupIndex: number) => {
    if (teamClickedRef.current) {
      return
    }

    if (!selectedTeam) {
      return
    }

    if (movingFromGroup !== null) {
      if (movingFromGroup === groupIndex) {
        setSelectedTeam(null)
        setMovingFromGroup(null)
        return
      }

      const canPlace = canPlaceTeamInGroup(
        selectedTeam.team,
        groupIndex,
        selectedTeam.potIndex,
        groups,
        movingFromGroup,
      )

      if (!canPlace) {
        return
      }

      const newGroups = [...groups]
      newGroups[movingFromGroup].teams = newGroups[movingFromGroup].teams.filter(
        (t) => t.code !== selectedTeam.team.code,
      )
      newGroups[groupIndex].teams.push({ ...selectedTeam.team, potIndex: selectedTeam.potIndex })
      setGroups(newGroups)

      setSelectedTeam(null)
      setMovingFromGroup(null)
      return
    }

    if (!canPlaceTeamInGroup(selectedTeam.team, groupIndex, selectedTeam.potIndex, groups)) {
      return
    }

    const newGroups = [...groups]
    newGroups[groupIndex].teams.push({ ...selectedTeam.team, potIndex: selectedTeam.potIndex })
    setGroups(newGroups)

    const newPots = [...availablePots]
    newPots[selectedTeam.potIndex].teams = newPots[selectedTeam.potIndex].teams.filter(
      (t) => t.code !== selectedTeam.team.code,
    )
    setAvailablePots(newPots)

    setSelectedTeam(null)

    if (newPots[currentPotIndex].teams.length === 0 && currentPotIndex < 3) {
      setCurrentPotIndex(currentPotIndex + 1)
    }

    const allPotsEmpty = newPots.every((pot) => pot.teams.length === 0)
    if (allPotsEmpty) {
      setIsDrawing(false)
    }
  }

  const resetDraw = () => {
    setIsTransitioning(true)

    setTimeout(() => {
      cancelDrawRef.current = true
      setGroups([])
      setCurrentDrawingTeam(null)
      setAvailablePots(teamsData.pots)
      setDrawMode(null)
      setSelectedTeam(null)
      setMovingFromGroup(null)
      setCurrentPotIndex(0)
      setIsDrawing(false)
      setIsTransitioning(false)
    }, 300)
  }

  const completeDrawAutomatically = () => {
    // Validate current state
    const currentTeamCount = groups.reduce((sum, group) => sum + group.teams.length, 0);
    const remainingTeamsNeeded = 48 - currentTeamCount;
    
    if (remainingTeamsNeeded <= 0) {
      console.error("[v0] Invalid state: too many teams placed");
      return;
    }

    // Deep clone the current groups to avoid mutation issues
    const currentGroups = groups.map(group => ({
      ...group,
      teams: [...group.teams]
    }));

  const remainingTeams: TeamEntry[] = []
    
    // Track which special teams we still need to place
    const needMexico = !currentGroups[0].teams.some(t => t.code === "MEX")
    const needCanada = !currentGroups[1].teams.some(t => t.code === "CAN")
    const needUSA = !currentGroups[3].teams.some(t => t.code === "USA")
    
    // Process each pot
    for (let potIndex = 0; potIndex < availablePots.length; potIndex++) {
      const pot = availablePots[potIndex]
      
      // First handle special teams if they're in this pot and still needed
      if (needMexico) {
        const mexTeam = pot.teams.find(t => t.code === "MEX")
        if (mexTeam) {
          remainingTeams.push({ team: { ...mexTeam, potIndex }, potIndex })
        }
      }
      
      if (needCanada) {
        const canTeam = pot.teams.find(t => t.code === "CAN")
        if (canTeam) {
          remainingTeams.push({ team: { ...canTeam, potIndex }, potIndex })
        }
      }
      
      if (needUSA) {
        const usaTeam = pot.teams.find(t => t.code === "USA")
        if (usaTeam) {
          remainingTeams.push({ team: { ...usaTeam, potIndex }, potIndex })
        }
      }
      
      // Then add all other teams from this pot
      const otherTeams = pot.teams.filter(t => 
        t.code !== "MEX" || !needMexico)
        .filter(t => t.code !== "CAN" || !needCanada)
        .filter(t => t.code !== "USA" || !needUSA)
      
      const shuffledTeams = shuffleArray([...otherTeams])
      shuffledTeams.forEach((team) => {
        remainingTeams.push({ team: { ...team, potIndex }, potIndex })
      })
    }

    // Count total teams available
    const totalAvailableTeams = remainingTeams.length;
    if (totalAvailableTeams !== remainingTeamsNeeded) {
      console.error("[v0] Mismatch in remaining teams count");
      alert("Erro no número de seleções disponíveis. Tente reiniciar o sorteio.");
      return;
    }

    // Try to complete the draw with multiple attempts if needed
    let result = null;
    let attempts = 5; // Try up to 5 times with different shuffles

    while (attempts > 0 && !result) {
      result = placeTeamsWithBacktracking(currentGroups, remainingTeams);
      if (!result) {
        // Reshuffle teams and try again
        remainingTeams.sort(() => Math.random() - 0.5);
        attempts--;
      }
    }

    if (!result) {
      console.error("[v0] Failed to complete draw - try resetting and starting over")
      alert("Não foi possível completar o sorteio com as seleções já colocadas. Tente reiniciar o sorteio.")
      return
    }

    // Validate final state
    const finalTeamCount = result.reduce((sum, group) => sum + group.teams.length, 0);
    const allGroupsComplete = result.every(group => group.teams.length === 4);

    if (finalTeamCount !== 48 || !allGroupsComplete) {
      console.error("[v0] Invalid final state", { finalTeamCount, allGroupsComplete });
      alert("Erro na distribuição final das seleções. Tente reiniciar o sorteio.");
      return;
    }

    setGroups(result)
    setIsDrawing(false)
    setAvailablePots([])
    setSelectedTeam(null)
  }

  const scrollPot = (potIndex: number, direction: "left" | "right") => {
    const container = document.getElementById(`pot-${potIndex}`)
    if (container) {
      const scrollAmount = 200
      container.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      })
    }
  }

  const generateShareImage = async () => {
    try {
      // Create canvas with social media optimized dimensions
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        console.error("Failed to get canvas context")
        alert("Erro ao criar imagem. Tente novamente.")
        return
      }
      
      // Set initial canvas dimensions
      canvas.width = 1200
      canvas.height = 1600
      
      // Layout measurements
      const layout = {
        headerHeight: 300,
        margin: 60,
        totalCols: 3,
        totalRows: 4,
        horizontalGap: 40,
        verticalGap: 40
      }

      // White background
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      canvas.width = 1200
      canvas.height = 1600

      // Background
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Add date
      ctx.fillStyle = "#666666";
      ctx.font = "16px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "right";
      const date = new Date().toLocaleDateString('pt-BR');
      ctx.fillText(date, canvas.width - 40, 85);

      // Main title with shadow
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)'
      ctx.shadowBlur = 4
      ctx.shadowOffsetY = 2
      ctx.fillStyle = "#16a34a"
      ctx.font = "bold 56px system-ui, -apple-system, sans-serif"
      ctx.textAlign = "center"
      ctx.fillText("Sorteio Copa do Mundo 2026", canvas.width / 2, 100)
      ctx.restore()

      // Subtitle
      ctx.fillStyle = "#666666"
      ctx.font = "28px system-ui, -apple-system, sans-serif"
      ctx.fillText("Definição dos Grupos", canvas.width / 2, 150)
      
      // Decorative line
      const lineWidth = 300
      ctx.beginPath()
      ctx.moveTo(canvas.width / 2 - lineWidth, 190)
      ctx.lineTo(canvas.width / 2 + lineWidth, 190)
      ctx.strokeStyle = "#e5e7eb"
      ctx.lineWidth = 2
      ctx.stroke()

      // Adjust canvas dimensions for better macOS display and branding
      canvas.width = 1200
      canvas.height = 1600

      // Create gradient background
      const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGradient.addColorStop(0, '#ffffff');
      bgGradient.addColorStop(1, '#f8fafc');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Add Lance.com.br branding text instead of logo
      ctx.save();
      ctx.fillStyle = "#111111";
      ctx.font = "bold 24px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("LANCE!", canvas.width - 40, 60);
      ctx.restore();      // Header section (top area)
      const headerHeight = 300
      const margin = 60
      
      // Draw main title
      ctx.save()
      ctx.fillStyle = "#16a34a"
      ctx.font = "bold 72px system-ui, -apple-system, sans-serif"
      ctx.textAlign = "center"
      ctx.shadowColor = "rgba(0, 0, 0, 0.2)"
      ctx.shadowBlur = 4
      ctx.shadowOffsetY = 2
      ctx.fillText("Sorteio Copa do Mundo 2026", canvas.width / 2, 120)
      ctx.restore()

      // Draw Lance! branding
      ctx.save()
      ctx.fillStyle = "#111111"
      ctx.font = "bold 36px system-ui, -apple-system, sans-serif"
      ctx.textAlign = "right"
      ctx.fillText("LANCE!", canvas.width - margin, 60)
      
      // Add date
      ctx.font = "20px system-ui, -apple-system, sans-serif"
      ctx.fillStyle = "#666666"
      ctx.fillText(new Date().toLocaleDateString('pt-BR'), canvas.width - margin, 90)
      ctx.restore()

      // Add separator line
      ctx.beginPath()
      ctx.moveTo(layout.margin, 180)
      ctx.lineTo(canvas.width - layout.margin, 180)
      ctx.strokeStyle = "#e5e7eb"
      ctx.lineWidth = 2
      ctx.stroke()
      
      // Calculate available space
      const availableWidth = canvas.width - (layout.margin * 2)
      const availableHeight = canvas.height - layout.headerHeight - layout.margin
      
      // Calculate group dimensions
      const groupWidth = Math.floor((availableWidth - (layout.horizontalGap * (layout.totalCols - 1))) / layout.totalCols)
      const groupHeight = Math.floor((availableHeight - (layout.verticalGap * (layout.totalRows - 1))) / layout.totalRows)
      
      // Starting position for groups
      const startX = layout.margin
      const startY = layout.headerHeight
      const cols = 3

      // Better background
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(1, '#f8f9fa');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < groups.length; i++) {
        const group = groups[i]
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = startX + col * (groupWidth + layout.horizontalGap)
        const y = startY + row * (groupHeight + layout.verticalGap)

        // Group border
        ctx.strokeStyle = "#e5e7eb"
        ctx.lineWidth = 4
        ctx.strokeRect(x, y, groupWidth, groupHeight)

      // Draw group card background with shadow
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.1)'
      ctx.shadowBlur = 20
      ctx.shadowOffsetY = 5
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.roundRect(x, y, groupWidth, groupHeight, 16)
      ctx.fill()
      ctx.restore()

      // Group header pill
      const headerPillHeight = 50
      const headerPillWidth = groupWidth - 40
      const headerY = y + 25
      
      // Draw pill background
      ctx.save()
      ctx.fillStyle = "#16a34a"
      ctx.beginPath()
      ctx.roundRect(x + (groupWidth - headerPillWidth) / 2, headerY, headerPillWidth, headerPillHeight, headerPillHeight / 2)
      ctx.fill()

      // Draw group text
      ctx.fillStyle = "#ffffff"
      ctx.font = "bold 32px system-ui, -apple-system, sans-serif"
      ctx.textAlign = "center"
      ctx.fillText(`Grupo ${group.name}`, x + groupWidth / 2, headerY + 35)
      ctx.restore()        // Draw teams in 2x2 grid
      // Team card dimensions
      const teamPadding = 20
      const teamGap = 15
      const headerSpace = 100 // Space for group header
      
      // Calculate team card size to fit within group
      const teamWidth = Math.floor((groupWidth - (3 * teamPadding)) / 2)
      const teamHeight = Math.floor((groupHeight - headerSpace - (3 * teamPadding)) / 2)
      
      // Position teams within group
      const teamStartX = x + teamPadding
      const teamStartY = y + headerSpace

      // Draw group card background with stronger shadow
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.1)'
      ctx.shadowBlur = 15
      ctx.shadowOffsetY = 4
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.roundRect(x, y, groupWidth, groupHeight, 12)
      ctx.fill()
      ctx.restore()

      // Add subtle gradient to group background
      const gradient = ctx.createLinearGradient(x, y, x, y + groupHeight)
      gradient.addColorStop(0, '#ffffff')
      gradient.addColorStop(1, '#f8f9fa')
      ctx.fillStyle = gradient
      ctx.fill()

      // Group border
      ctx.strokeStyle = "#e5e7eb"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(x, y, groupWidth, groupHeight, 12)
      ctx.stroke()

      for (let j = 0; j < group.teams.length; j++) {
        const team = group.teams[j]
        const teamCol = j % 2
        const teamRow = Math.floor(j / 2)
        const teamX = teamStartX + teamCol * (teamWidth + teamGap)
        const teamY = teamStartY + teamRow * (teamHeight + teamGap)          // Team background
          ctx.fillStyle = "#f9fafb"
          ctx.fillRect(teamX, teamY, teamWidth, teamHeight)
          ctx.strokeStyle = "#e5e7eb"
          ctx.lineWidth = 2
          ctx.strokeRect(teamX, teamY, teamWidth, teamHeight)

          // Load and draw team flag/logo
          try {
            if (team.logo) {
              const flagImage = new Image()
              flagImage.src = team.logo
              const drawFlag = await new Promise<void>((resolve, reject) => {
                flagImage.onload = () => {
                  const flagSize = 48
                  ctx.drawImage(
                    flagImage,
                    teamX + (teamWidth - flagSize) / 2,
                    teamY + 20,
                    flagSize,
                    flagSize
                  )
                  resolve()
                }
                flagImage.onerror = () => reject()
              }).catch(() => {
                // Fallback to emoji if image fails to load
                ctx.font = "48px system-ui, -apple-system, sans-serif"
                ctx.textAlign = "center"
                ctx.fillText(team.flag, teamX + teamWidth / 2, teamY + 55)
              })
            } else {
              ctx.font = "48px system-ui, -apple-system, sans-serif"
              ctx.textAlign = "center"
              ctx.fillText(team.flag, teamX + teamWidth / 2, teamY + 55)
            }
          } catch (error) {
            // Fallback to emoji if there's any error
            ctx.font = "48px system-ui, -apple-system, sans-serif"
            ctx.textAlign = "center"
            ctx.fillText(team.flag, teamX + teamWidth / 2, teamY + 55)
          }

          // Team name
          ctx.fillStyle = "#000000"
          ctx.font = "600 24px system-ui, -apple-system, sans-serif"
          ctx.textAlign = "center"
          const teamName = team.name.length > 13 ? team.name.substring(0, 11) + "..." : team.name
          ctx.fillText(teamName, teamX + teamWidth / 2, teamY + 95)

          // Confederation
          ctx.fillStyle = "#666666"
          ctx.font = "18px system-ui, -apple-system, sans-serif"
          ctx.fillText(team.confederation, teamX + teamWidth / 2, teamY + 120)
        }
      }

      console.log("[v0] Canvas drawn successfully")

      // Convert to data URL
      // Convert to data URL and trigger download
      const dataUrl = canvas.toDataURL("image/png")
      
      // Create download link
      const link = document.createElement("a")
      link.href = dataUrl
      link.download = `sorteio-copa-2026-${new Date().getTime()}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      console.log("[v0] Image generation completed")
    } catch (error) {
      console.error("[v0] Error generating image:", error)
      alert("Erro ao gerar imagem. Tente novamente.")
    }
  }

  const hasDrawn = groups.length > 0 && groups[0].teams.length > 0
  const isManualMode = drawMode === "manual"
  const isAutomaticMode = drawMode === "automatic"
  const isInstantMode = drawMode === "instant"
  const shouldShowGroups = hasDrawn || (isManualMode && groups.length > 0)
  const hasRemainingTeams = availablePots.some((pot) => pot.teams.length > 0)
  const isDrawComplete = groups.length === 12 && groups.every((group) => group.teams.length === 4)

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground py-4 md:py-6 mb-4 md:mb-6 shadow-sm">
        <div className="container mx-auto px-3 md:px-4 max-w-7xl">
          <div className="flex items-center justify-center gap-2 md:gap-3">
            <Trophy className="w-8 h-8 md:w-10 md:h-10 shrink-0" />
            <div className="text-center">
              <h1 className="text-xl md:text-3xl lg:text-4xl font-bold leading-tight">Copa do Mundo FIFA 2026</h1>
              <p className="text-sm md:text-lg opacity-90">Simulador de Sorteio</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-3 md:px-4 pb-6 md:pb-8 max-w-7xl">
        {!drawMode && (
          <div
            className={`flex flex-col items-center transition-opacity duration-300 ${isTransitioning ? "opacity-0" : "opacity-100"}`}
          >
            <h2 className="text-lg md:text-xl font-bold mb-3 md:mb-4 text-center">Tipos de Simulação</h2>
            <div className="flex gap-2 md:gap-3 overflow-x-auto pb-2 mb-4 md:mb-6 snap-x snap-mandatory">
              <Button onClick={() => startDraw("automatic")} size="lg" className="gap-2 shrink-0 snap-center">
                <Shuffle className="w-4 h-4 md:w-5 md:h-5" />
                <span className="text-sm md:text-base">Automático</span>
              </Button>
              <Button
                onClick={() => startDraw("instant")}
                variant="secondary"
                size="lg"
                className="gap-2 shrink-0 snap-center"
              >
                <Zap className="w-4 h-4 md:w-5 md:h-5" />
                <span className="text-sm md:text-base">Instantâneo</span>
              </Button>
              <Button
                onClick={() => startDraw("manual")}
                variant="outline"
                size="lg"
                className="gap-2 shrink-0 snap-center"
              >
                <Hand className="w-4 h-4 md:w-5 md:h-5" />
                <span className="text-sm md:text-base">Manual</span>
              </Button>
            </div>
          </div>
        )}

        {drawMode && (
          <div
            className={`flex gap-2 md:gap-3 overflow-x-auto pb-2 mb-4 md:mb-6 snap-x snap-mandatory transition-all duration-500 ${isTransitioning ? "opacity-0 -translate-y-2" : "opacity-100 translate-y-0"}`}
          >
            <div className="px-3 py-2 bg-primary text-primary-foreground rounded-lg font-semibold text-xs md:text-sm shrink-0 snap-center flex items-center">
              {isManualMode ? "Modo Manual" : isInstantMode ? "Modo Instantâneo" : "Modo Automático"}
            </div>
            {isManualMode && hasRemainingTeams && (
              <Button
                onClick={completeDrawAutomatically}
                variant="secondary"
                size="lg"
                className="gap-2 shrink-0 snap-center"
              >
                <Zap className="w-4 h-4 md:w-5 md:h-5" />
                <span className="text-sm md:text-base">Completar</span>
              </Button>
            )}
            <Button
              onClick={resetDraw}
              variant="outline"
              size="lg"
              className="gap-2 bg-transparent shrink-0 snap-center"
            >
              <RotateCcw className="w-4 h-4 md:w-5 md:h-5" />
              <span className="text-sm md:text-base">Reiniciar</span>
            </Button>
          </div>
        )}

        {currentDrawingTeam && (
          <Card
            className={`p-4 md:p-6 mb-4 md:mb-6 bg-primary text-primary-foreground transition-all duration-500 ${isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"}`}
          >
            <div className="flex items-center justify-center gap-3">
              {currentDrawingTeam.logo ? (
                <img 
                  src={currentDrawingTeam.logo} 
                  alt={`${currentDrawingTeam.name} flag`}
                  className="w-12 h-12 md:w-16 md:h-16 object-contain"
                />
              ) : (
                <span className="text-3xl md:text-4xl">{currentDrawingTeam.flag}</span>
              )}
              <div className="text-left">
                <p className="text-xs font-medium opacity-90">Sorteando</p>
                <h2 className="text-lg md:text-2xl font-bold leading-tight">{currentDrawingTeam.name}</h2>
              </div>
            </div>
          </Card>
        )}

        {isManualMode && availablePots.length > 0 && (
          <Card
            className={`p-3 md:p-4 mb-4 md:mb-6 bg-accent/10 border-accent transition-all duration-500 ${isTransitioning ? "opacity-0 -translate-y-2" : "opacity-100 translate-y-0"}`}
          >
            <div className="text-sm md:text-base font-semibold mb-1 flex items-center gap-2">
              {selectedTeam ? (
                <div className="flex items-center gap-2">
                  {selectedTeam.team.logo ? (
                    <img 
                      src={selectedTeam.team.logo} 
                      alt={`${selectedTeam.team.name} flag`}
                      className="w-6 h-6 object-contain"
                    />
                  ) : (
                    <span>{selectedTeam.team.flag}</span>
                  )}
                  <span>
                    {movingFromGroup !== null
                      ? `${selectedTeam.team.name} - Mover para outro grupo`
                      : `${selectedTeam.team.name} - Selecione um grupo`}
                  </span>
                </div>
              ) : (
                'Selecione uma seleção'
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {movingFromGroup !== null
                ? "Clique em um grupo para mover ou clique no grupo atual para cancelar"
                : "México no Grupo A • Mesmo pote separado • Mesma confederação separada (UEFA: máx 2/grupo em 4 grupos)"}
            </p>
          </Card>
        )}

        {!isAutomaticMode &&
          !isInstantMode &&
          availablePots.length > 0 &&
          availablePots.some((pot) => pot.teams.length > 0) && (
            <div
              className={`space-y-4 transition-all duration-500 ${selectedTeam ? "mb-4" : "mb-6 md:mb-8"} ${isTransitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}
            >
              <h2 className="text-lg md:text-xl font-bold mb-3 md:mb-4">Potes do Torneio</h2>
              {availablePots.map((pot, potIndex) => {
                const shouldHidePot = selectedTeam && selectedTeam.potIndex !== potIndex

                return (
                  <Card
                    key={potIndex}
                    className={`p-3 md:p-4 transition-all duration-500 ${
                      isManualMode && pot.teams.length > 0
                        ? "ring-2 ring-primary shadow-lg"
                        : pot.teams.length === 0
                          ? "opacity-50"
                          : ""
                    } ${shouldHidePot ? "opacity-0 h-0 overflow-hidden p-0 mb-0" : "opacity-100"}`}
                  >
                    {!shouldHidePot && (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm md:text-base font-bold text-primary">{pot.name}</h3>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => scrollPot(potIndex, "left")}
                              className="h-7 w-7 p-0"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => scrollPot(potIndex, "right")}
                              className="h-7 w-7 p-0"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <div
                          id={`pot-${potIndex}`}
                          className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide"
                          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                        >
                          {pot.teams.map((team, teamIndex) => (
                            <button
                              key={teamIndex}
                              onClick={() => isManualMode && handleTeamSelect(team, potIndex)}
                              disabled={!isManualMode || pot.teams.length === 0}
                              className={`shrink-0 w-24 md:w-28 snap-center transition-all ${
                                isManualMode && pot.teams.length > 0
                                  ? "hover:scale-105 cursor-pointer active:scale-95"
                                  : "cursor-not-allowed"
                              } ${selectedTeam?.team.code === team.code ? "scale-105" : ""}`}
                            >
                              <Card
                                className={`p-2 h-full ${
                                  selectedTeam?.team.code === team.code
                                    ? "ring-2 ring-primary bg-accent shadow-lg"
                                    : "bg-card hover:bg-accent/50"
                                }`}
                              >
                                <div className="flex flex-col items-center gap-1.5 text-center">
                                  {team.logo ? (
                                    <img 
                                      src={team.logo} 
                                      alt={`${team.name} flag`}
                                      className="w-8 h-8 md:w-10 md:h-10 object-contain"
                                    />
                                  ) : (
                                    <span className="text-2xl md:text-3xl">{team.flag}</span>
                                  )}
                                  <p className="font-semibold text-xs leading-tight line-clamp-2">{team.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{team.confederation}</p>
                                </div>
                              </Card>
                            </button>
                          ))}
                          {pot.teams.length === 0 && (
                            <div className="w-full text-center py-4 text-muted-foreground text-xs">Todas sorteadas</div>
                          )}
                        </div>
                      </>
                    )}
                  </Card>
                )
              })}
            </div>
          )}

        {shouldShowGroups && (
          <div
            ref={groupsRef}
            className={`transition-all duration-500 ${isTransitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"}`}
          >
            <div className="flex items-center justify-between gap-2 mb-3 md:mb-4">
              <h2 className="text-lg md:text-xl font-bold">
                {isManualMode ? "Sorteio em Andamento" : "Resultado do Sorteio"}
              </h2>
              {isManualMode && hasRemainingTeams && (
                <Button
                  onClick={completeDrawAutomatically}
                  variant="default"
                  size="sm"
                  className="gap-1.5 shrink-0"
                >
                  <Zap className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  <span className="text-xs md:text-sm">Completar</span>
                </Button>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-3 snap-x snap-mandatory md:grid md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6">
              {groups.map((group, groupIndex) => {
                const canPlace =
                  selectedTeam &&
                  canPlaceTeamInGroup(selectedTeam.team, groupIndex, selectedTeam.potIndex, groups, movingFromGroup)

                return (
                  <Card
                    key={groupIndex}
                    onClick={() => isManualMode && selectedTeam && handleGroupSelect(groupIndex)}
                    className={`p-2 shrink-0 w-32 md:w-auto snap-center animate-in fade-in slide-in-from-bottom-4 duration-500 transition-all ${
                      isManualMode && selectedTeam
                        ? canPlace
                          ? "cursor-pointer hover:ring-2 hover:ring-primary hover:shadow-lg active:scale-95"
                          : "opacity-50 cursor-not-allowed"
                        : ""
                    } ${movingFromGroup === groupIndex ? "ring-2 ring-amber-500" : ""}`}
                    style={{ animationDelay: `${groupIndex * 50}ms` }}
                  >
                    <div className="text-center mb-1.5">
                      <div className="inline-flex items-center justify-center w-6 h-6 md:w-7 md:h-7 rounded-full bg-primary text-primary-foreground font-bold text-xs md:text-sm mb-0.5">
                        {group.name}
                      </div>
                      <h3 className="text-[10px] md:text-xs font-bold">Grupo {group.name}</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {group.teams.map((team, teamIndex) => (
                        <div
                          key={teamIndex}
                          onClick={(e) => {
                            if (isManualMode) {
                              handlePlacedTeamClick(team, groupIndex, e)
                            }
                          }}
                          className={`flex flex-col items-center gap-0.5 p-1 rounded-md bg-card border border-border transition-all ${
                            isManualMode
                              ? "cursor-pointer hover:bg-accent hover:ring-1 hover:ring-primary active:scale-95"
                              : "hover:bg-accent/50"
                          } ${selectedTeam?.team.code === team.code && movingFromGroup === groupIndex ? "ring-1 ring-primary bg-accent" : ""}`}
                        >
                          {team.logo ? (
                            <img 
                              src={team.logo} 
                              alt={`${team.name} flag`}
                              className="w-6 h-6 md:w-8 md:h-8 object-contain shrink-0"
                            />
                          ) : (
                            <span className="text-sm md:text-base shrink-0">{team.flag}</span>
                          )}
                          <p className="font-semibold text-[8px] md:text-[9px] text-center leading-tight line-clamp-1">
                            {team.name}
                          </p>
                          <p className="text-[7px] md:text-[8px] text-muted-foreground">{team.confederation}</p>
                        </div>
                      ))}
                      {group.teams.length === 0 && !isManualMode && (
                        <div className="col-span-2 text-center py-2 md:py-3 text-muted-foreground text-[9px]">
                          Aguardando...
                        </div>
                      )}
                      {isManualMode &&
                        Array.from({ length: 4 - group.teams.length }).map((_, i) => (
                          <div
                            key={`empty-${i}`}
                            className="p-1 rounded-md border border-dashed border-muted-foreground/20 text-center text-muted-foreground text-[8px] flex items-center justify-center min-h-12"
                          >
                            Vaga
                          </div>
                        ))}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {isDrawComplete && (
          <div className="mt-6 md:mt-8 flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Button onClick={generateShareImage} size="lg" className="gap-2 shadow-lg">
              <Download className="w-5 h-5" />
              <span>Baixar Imagem para Compartilhar</span>
            </Button>
          </div>
        )}

        <div className="mt-6 md:mt-8 text-center text-xs text-muted-foreground space-y-1">
          <p>48 seleções • 12 grupos • 4 seleções por grupo</p>
          <p>
            Edite <code className="px-1.5 py-0.5 bg-muted rounded text-xs">data/teams.json</code> para personalizar
          </p>
        </div>
      </div>
    </div>
  )
}
