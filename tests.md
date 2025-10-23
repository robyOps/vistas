# Pruebas manuales

1. **Carga inicial**
   - Abrir `index.html` en el navegador.
   - Verificar que se renderiza el diagrama completo con RBAC incluido.
   - Confirmar que el resumen anuncia la cantidad de entidades y relaciones.

2. **Búsqueda**
   - Escribir `Ticket` en el cuadro de búsqueda.
   - La lista debe reducirse a las entidades cuyo nombre contiene "Ticket".

3. **Foco y profundidad**
   - Seleccionar la entidad `Ticket` en la lista.
   - Con profundidad = 1, observar solo `Ticket` y sus vecinos directos.
   - Cambiar la profundidad a 2. Deben aparecer entidades relacionadas a través de un segundo salto (por ejemplo, `EventLog`).

4. **Mostrar todo**
   - Pulsar "Mostrar todo".
   - El diagrama debe volver a mostrar todas las entidades según la configuración de RBAC.

5. **Toggle RBAC**
   - Desactivar "Incluir RBAC".
   - Las entidades `UserGroups`, `Group`, `GroupPermissions`, `Permission` y `ContentType` y sus relaciones desaparecen.

6. **Exportaciones**
   - Pulsar "Descargar SVG" y "Descargar PNG".
   - Verificar que ambos archivos se descargan y no están vacíos.

7. **Copiar Mermaid**
   - Pulsar "Copiar Mermaid".
   - Confirmar que el código se copia al portapapeles.

8. **Colores y estilos**
   - Verificar que cada grupo (hub, catalog, tickets, rbac) muestra colores distintos. RBAC debe tener borde discontinuo.

9. **Accesibilidad**
   - Navegar con el teclado a través de los controles y la lista de entidades.
   - Presionar Enter sobre una entidad debe enfocarla y renderizar el diagrama correspondiente.

10. **Estados vacíos**
    - Con RBAC desactivado, escribir `Group` en la búsqueda y pulsar Enter.
    - Debe mostrarse el mensaje "Entidad no encontrada" y conservarse el diagrama actual.
